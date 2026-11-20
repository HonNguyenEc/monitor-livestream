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
import { SAMPLE_BACKEND_DETAILS, SAMPLE_BACKEND_ROWS } from '../fixtures/shop.fixtures';
import { VerifiedCookie } from '../models/seller-account.model';
import { ShopRecord, ShopsDocument } from '../models/shop-record.model';
import { StoredShop } from '../models/stored-shop.model';
import { CookieRepository } from '../repositories/cookie.repository';
import { ShopRepository } from '../repositories/shop.repository';
import { inputFromCreate, inputFromUpdate, withUnknownFields } from '../utils/shop-input';
import { shopKey } from '../utils/shop-identity';
import { toShopDetail, toShopRow } from '../utils/shop-view';
import { findStoredShop, storedShops } from '../utils/stored-shops';
import { SellerAccountService } from './seller-account.service';
import { ShopCookieService } from './shop-cookie.service';
import { ShopFieldsValidator } from './shop-fields.validator';

// Backend channels stay sample data until the backend sync lands.
@Injectable()
export class ShopsService {
  // Every read-modify-write of shops.json runs under this lock, as the Python tool's _write_lock.
  private readonly writeLock = new AsyncLock();

  constructor(
    private readonly shopRepository: ShopRepository,
    private readonly cookieRepository: CookieRepository,
    private readonly validator: ShopFieldsValidator,
    private readonly sellerAccounts: SellerAccountService,
    private readonly shopCookies: ShopCookieService,
  ) {}

  async list(): Promise<ShopListResponseDto> {
    const [document, cookies] = await Promise.all([
      this.shopRepository.load(),
      this.cookieRepository.load(),
    ]);
    const local = storedShops(document).map((shop) => toShopRow(shop, cookies));
    return { items: [...local, ...SAMPLE_BACKEND_ROWS] };
  }

  async get(key: string): Promise<ShopDetailDto> {
    const [document, cookies] = await Promise.all([
      this.shopRepository.load(),
      this.cookieRepository.load(),
    ]);
    const local = findStoredShop(storedShops(document), key);
    if (local) {
      return toShopDetail(local, cookies);
    }
    const backend = SAMPLE_BACKEND_DETAILS.find((detail) => detail.key === key);
    if (!backend) {
      throw notFound(key);
    }
    return backend;
  }

  async create(body: CreateShopDto): Promise<ShopDetailDto> {
    this.validator.rejectForeignFields(body.platform, body);
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
    const before = editableShop(storedShops(await this.shopRepository.load()), key);
    this.validator.rejectForeignFields(before.platform, body);
    const verified =
      body.cookie === undefined ? null : await this.sellerAccounts.verify(body.cookie);
    return this.writeLock.run(async () => {
      const document = await this.shopRepository.load();
      const current = editableShop(storedShops(document), key);
      this.validator.rejectForeignFields(current.platform, body);
      const input = inputFromUpdate(current.platform, current.record, body);
      const shop = withUnknownFields(this.validator.clean(current.platform, input), current.record);
      if (verified) {
        this.sellerAccounts.applyAccount(shop, verified.account);
      } else if (current.platform === Platform.SHOPEE) {
        const cookies = await this.cookieRepository.load();
        this.sellerAccounts.keepStoredAccount(shop, current.record, cookies);
      }
      const saved = this.place(document, shop, current);
      return this.save(document, saved, verified, current.record[ShopField.USER_ID]);
    });
  }

  async remove(key: string): Promise<void> {
    await this.writeLock.run(async () => {
      const document = await this.shopRepository.load();
      const shops = storedShops(document);
      const shop = editableShop(shops, key);
      // Like the Python tool, entries that share the key go together.
      const removed = new Set(
        shops.filter((other) => other.key === key).map((other) => other.index),
      );
      document.shops = document.shops.filter((_record, index) => !removed.has(index));
      await this.shopRepository.save(document);
      await this.shopCookies.forgetUnused(shop.record[ShopField.USER_ID], document.shops);
    });
  }

  /** Writes shops.json first, then the cookie, in the Python tool's order. */
  private async save(
    document: ShopsDocument,
    saved: StoredShop,
    verified: VerifiedCookie | null,
    previousUserId: unknown,
  ): Promise<ShopDetailDto> {
    await this.shopRepository.save(document);
    const cookies = verified
      ? await this.shopCookies.remember(
          verified.cookie,
          saved.record[ShopField.USER_ID],
          previousUserId,
          document.shops,
        )
      : await this.cookieRepository.load();
    return toShopDetail(saved, cookies);
  }

  /** Puts `shop` in place of `current`, or appends it, once its key is free. */
  private place(document: ShopsDocument, shop: ShopRecord, current: StoredShop | null): StoredShop {
    const platform = shop.platform as Platform;
    const key = shopKey(platform, shop);
    const taken =
      storedShops(document).some((other) => other.key === key && other.index !== current?.index) ||
      isSampleBackend(key);
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
  if (local?.source === ShopSource.BACKEND || (!local && isSampleBackend(key))) {
    throw new DomainException(ErrorCode.BACKEND_SHOP_READ_ONLY, ErrorMessage.backendReadOnly);
  }
  if (!local) {
    throw notFound(key);
  }
  return local;
}

function isSampleBackend(key: string): boolean {
  return SAMPLE_BACKEND_ROWS.some((row) => row.key === key);
}

function notFound(key: string): DomainException {
  return new DomainException(ErrorCode.SHOP_NOT_FOUND, ErrorMessage.shopNotFound(key));
}
