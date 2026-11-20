const LIST_SEPARATOR = ', ';

// User-facing text of every DomainException and local-request refusal; clients branch on the code.
export const ErrorMessage = {
  hostNotAllowed: 'Chỉ nhận request gửi tới localhost.',
  originNotAllowed: (origin: string): string => `Trang ${origin} không được phép ghi dữ liệu.`,
  noPlatformSelected: 'Chọn ít nhất một nền tảng để theo dõi.',
  frameNotFound: (key: string): string => `Chưa có khung hình nào của shop ${key}.`,
  shopNotFound: (key: string): string => `Không tìm thấy shop ${key}.`,
  shopAlreadyExists: (key: string): string => `Shop ${key} đã tồn tại.`,
  backendReadOnly: 'Shop đồng bộ từ backend, không sửa hoặc xoá ở đây được.',
  missingField: (field: string): string => `Thiếu trường bắt buộc: ${field}.`,
  notPositiveInteger: (field: string): string => `${field} phải là số nguyên dương.`,
  liveUrlScheme: 'live_url phải bắt đầu bằng http:// hoặc https://.',
  fieldsNotForPlatform: (platform: string, fields: string[]): string =>
    `Shop ${platform} không dùng trường: ${fields.join(LIST_SEPARATOR)}.`,
  cookieWithoutSession: (cookieName: string): string =>
    `Cookie phải có ${cookieName}: copy header "cookie" của một request tới banhang.shopee.vn.`,
  sellerCenterUnreachable: 'Không kết nối được Seller Center. Hãy thử lại sau.',
  cookieRejected:
    'Seller Center từ chối cookie (hết hạn hoặc sai). Hãy đăng nhập lại và copy cookie mới.',
  cookieAccountMismatch: (username: string, accountId: number, typedId: unknown): string =>
    `Cookie thuộc tài khoản ${username} (user_id ${accountId}), không khớp user_id ${typedId} đã nhập.`,
  missingStoredCookie: 'Thiếu cookie Seller Center của shop.',
  userIdNeedsCookie: 'Đổi user_id cần dán cookie Seller Center mới của shop đó.',
} as const;
