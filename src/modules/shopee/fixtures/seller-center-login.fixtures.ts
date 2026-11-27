// Synthetic bodies with the fields seller_center_account in resolvers.py reads; ids and names are fake.
export const LOGIN_OK = {
  id: 900000001,
  shopid: 900000002,
  username: 'sample.seller',
  phone: '',
  email: '',
};

export const LOGIN_WITHOUT_SHOP = { id: '900000003', shopid: 0, username: '' };

// Seller Center answers an expired session with an error body instead of the account.
export const LOGIN_EXPIRED = { error: 'error_auth', message: 'not login' };
