/** The Shopee account behind a Seller Center cookie. */
export interface SellerAccount {
  user_id: number;
  shop_id: number | null;
  username: string;
}

export interface VerifiedCookie {
  /** `SPC_SC_SESSION=<value>`; never log it. */
  cookie: string;
  account: SellerAccount;
}
