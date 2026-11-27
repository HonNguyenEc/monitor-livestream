import { Injectable } from '@nestjs/common';

import { AsyncLock } from '../../../common/concurrency/async-lock';
import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ShopField } from '../constants/shop-fields.constants';
import { CreateShopDto } from '../dtos/create-shop.dto';
import { ShopDetailDto } from '../dtos/shop-detail.dto';
import { ShopListResponseDto } from '../dtos/shop-list-response.dto';
import { UpdateShopDto } from '../dtos/update-shop.dto';
import { VerifiedCookie } from '../models/seller-account.model';
import { ShopRecord, ShopsDocument } from '../models/shop-record.model';
import { StoredShop } from '../models/stored-shop.model';
import { BackendSyncStore } from '../../backend';
import { DetectionControl, DetectionStateStore } from '../../detection-state';
import { ShopRepository } from '../repositories/shop.repository';
import { backendDetailParts } from '../utils/backend-shops';
import { allShops } from '../utils/channel';
import { inputFromCreate, inputFromUpdate, withUnknownFields } from '../utils/shop-input';
import { shopKey } from '../utils/shop-identity';
import { toShopDetail, toShopRow } from '../utils/shop-view';
import { findStoredShop, storedShops } from '../utils/stored-shops';
import { SellerAccountService } from './seller-account.service';
import { ShopCookieService } from './shop-cookie.service';
import { ShopFieldsValidator } from './shop-fields.validator';

@Injectable()
export class ShopsService {
  // Every read-modify-write of shops.json runs under this lock, as the Python tool's _write_lock.
  private readonly writeLock = new AsyncLock();

  constructor(
    private readonly shopRepository: ShopRepository,
    private readonly validator: ShopFieldsValidator,
    private readonly sellerAccounts: SellerAccountService,
    private readonly shopCookies: ShopCookieService,
    private readonly backendStore: BackendSyncStore,
    private readonly detectionStore: DetectionStateStore,
    private readonly detectionControl: DetectionControl,
  ) {}

  async list(): Promise<ShopListResponseDto> {
    const [document, cookies] = await Promise.all([
      this.shopRepository.load(),
      this.shopCookies.peek(),
    ]);
    const shops = this.shopsOf(document);
    return {
      items: shops.map((shop) => toShopRow(shop, cookies, this.detectionStore.get(shop.key))),
    };
  }

  async get(key: string): Promise<ShopDetailDto> {
    const [document, cookies] = await Promise.all([
      this.shopRepository.load(),
      this.shopCookies.peek(),
    ]);
    const shop = findStoredShop(this.shopsOf(document), key);
    if (!shop) {
      throw notFound(key);
    }
    const backend =
      shop.source === ShopSource.BACKEND ? backendDetailParts(this.backendStore, shop) : undefined;
    return toShopDetail(shop, cookies, this.detectionStore.get(shop.key), backend);
  }

  async create(body: CreateShopDto): Promise<ShopDetailDto> {
    this.validator.rejectForeignFields(body.platform, body);
    this.validator.assertSuppliedLiveUrl(body.platform, body.live_url);
    const shop = this.validator.clean(body.platform, inputFromCreate(body));
    // Seller Center is called before taking the lock, so a slow login check never blocks other edits.
    const verified =
      body.cookie === undefined ? null : await this.sellerAccounts.verify(body.cookie);
    if (verified) {
      this.sellerAccounts.applyAccount(shop, verified.account);
    }
    return this.writeLock.run(async () => {
      const document = await this.shopRepository.load();
      const saved = this.place(document, shop, null);
      return this.save(document, saved, verified, undefined);
    });
  }

  async update(key: string, body: UpdateShopDto): Promise<ShopDetailDto> {
    const before = editableShop(this.shopsOf(await this.shopRepository.load()), key);
    this.validator.rejectForeignFields(before.platform, body);
    this.validator.assertSuppliedLiveUrl(before.platform, body.live_url);
    const verified =
      body.cookie === undefined ? null : await this.sellerAccounts.verify(body.cookie);
    return this.writeLock.run(async () => {
      const document = await this.shopRepository.load();
      const current = editableShop(this.shopsOf(document), key);
      this.validator.rejectForeignFields(current.platform, body);
      const input = inputFromUpdate(current.platform, current.record, body);
      const shop = withUnknownFields(this.validator.clean(current.platform, input), current.record);
      if (verified) {
        this.sellerAccounts.applyAccount(shop, verified.account);
      } else if (current.platform === Platform.SHOPEE) {
        const cookies = await this.shopCookies.load();
        this.sellerAccounts.keepStoredAccount(shop, current.record, cookies);
      }
      const saved = this.place(document, shop, current);
      const detail = await this.save(document, saved, verified, current.record[ShopField.USER_ID]);
      // A rename is a new channel: the job of the old key must not keep running or keep its player.
      if (detail.key !== key) await this.detectionControl.rename(key, detail.key);
      return detail;
    });
  }

  async remove(key: string): Promise<void> {
    await this.writeLock.run(async () => {
      const document = await this.shopRepository.load();
      const shops = storedShops(document);
      const shop = editableShop(this.shopsOf(document), key);
      // Like the Python tool, entries that share the key go together.
      const removed = new Set(
        shops.filter((other) => other.key === key).map((other) => other.index),
      );
      document.shops = document.shops.filter((_record, index) => !removed.has(index));
      await this.shopRepository.save(document);
      await this.shopCookies.forgetUnused(shop.record[ShopField.USER_ID], document.shops);
      await this.detectionControl.stop(key);
    });
  }

  private shopsOf(document: ShopsDocument): StoredShop[] {
    return allShops(document, this.backendStore);
  }

  /**
   * Stores the cookie before shops.json: a failed cookie write leaves both files as they were, and a
   * failed shops.json write puts the previous cookie back.
   */
  private async save(
    document: ShopsDocument,
    saved: StoredShop,
    verified: VerifiedCookie | null,
    previousUserId: unknown,
  ): Promise<ShopDetailDto> {
    const userId = saved.record[ShopField.USER_ID];
    const remembered = verified ? await this.shopCookies.remember(verified.cookie, userId) : null;
    const cookies = remembered?.cookies ?? (await this.shopCookies.peek());
    try {
      await this.shopRepository.save(document);
    } catch (error) {
      await remembered?.undo();
      throw error;
    }
    if (verified && previousUserId !== userId) {
      await this.shopCookies.forgetUnused(previousUserId, document.shops);
    }
    return toShopDetail(saved, cookies, this.detectionStore.get(saved.key));
  }

  /** Puts `shop` in place of `current`, or appends it, once its key is free. */
  private place(document: ShopsDocument, shop: ShopRecord, current: StoredShop | null): StoredShop {
    const platform = shop.platform as Platform;
    const key = shopKey(platform, shop);
    const taken = this.shopsOf(document).some(
      (other) => other.key === key && other.index !== current?.index,
    );
    if (taken) {
      throw new DomainException(ErrorCode.SHOP_ALREADY_EXISTS, ErrorMessage.shopAlreadyExists(key));
    }
    const index = current ? current.index : document.shops.length;
    document.shops[index] = shop;
    return { key, platform, source: ShopSource.LOCAL, record: shop, index };
  }
}

function editableShop(shops: StoredShop[], key: string): StoredShop {
  const local = findStoredShop(shops, key);
  if (local?.source === ShopSource.BACKEND) {
    throw new DomainException(ErrorCode.BACKEND_SHOP_READ_ONLY, ErrorMessage.backendReadOnly);
  }
  if (!local) {
    throw notFound(key);
  }
  return local;
}

function notFound(key: string): DomainException {
  return new DomainException(ErrorCode.SHOP_NOT_FOUND, ErrorMessage.shopNotFound(key));
}
