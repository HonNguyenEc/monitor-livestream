import { SellerAccount } from '../../shopee';

export interface VerifiedCookie {
  /** `SPC_SC_SESSION=<value>`; never log it. */
  cookie: string;
  account: SellerAccount;
}
