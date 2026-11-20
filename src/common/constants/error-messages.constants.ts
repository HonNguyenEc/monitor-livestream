const LIST_SEPARATOR = ', ';

// User-facing text of every DomainException and local-request refusal; clients branch on the code.
// fieldMustNotBeNull is the exception: it is English, to read like the class-validator messages it is listed with.
export const ErrorMessage = {
  hostNotAllowed: 'Chỉ nhận request gửi tới localhost.',
  originNotAllowed: (origin: string): string => `Trang ${origin} không được phép ghi dữ liệu.`,
  crossSiteNotAllowed: 'Yêu cầu từ trang web khác không được phép.',
  shopeeLiveUrlNotAllowed: (domains: readonly string[]): string =>
    `live_url của kênh Shopee phải là địa chỉ https thuộc ${domains.join(' hoặc ')}.`,
  noPlatformSelected: 'Chọn ít nhất một nền tảng để theo dõi.',
  frameNotFound: (key: string): string => `Chưa có khung hình nào của kênh ${key}.`,
  shopNotFound: (key: string): string => `Không tìm thấy kênh ${key}.`,
  shopAlreadyExists: (key: string): string => `Kênh ${key} đã tồn tại.`,
  backendReadOnly: 'Kênh đồng bộ từ backend, không sửa hoặc xoá ở đây được.',
  missingField: (field: string): string => `Thiếu trường bắt buộc: ${field}.`,
  notPositiveInteger: (field: string): string => `${field} phải là số nguyên dương.`,
  liveUrlScheme: 'live_url phải bắt đầu bằng http:// hoặc https://.',
  fieldsNotForPlatform: (platform: string, fields: string[]): string =>
    `Kênh ${platform} không dùng trường: ${fields.join(LIST_SEPARATOR)}.`,
  cookieWithoutSession: (cookieName: string): string =>
    `Cookie phải có ${cookieName}: copy header "cookie" của một request tới banhang.shopee.vn.`,
  cookieInvalidCharacters:
    'Cookie có ký tự không hợp lệ (chỉ nhận ký tự ASCII in được). Hãy copy lại header "cookie".',
  sellerCenterUnreachable: 'Không kết nối được Seller Center. Hãy thử lại sau.',
  cookieRejected:
    'Seller Center từ chối cookie (hết hạn hoặc sai). Hãy đăng nhập lại và copy cookie mới.',
  cookieAccountMismatch: (username: string, accountId: number, typedId: unknown): string =>
    `Cookie thuộc tài khoản ${username} (user_id ${accountId}), không khớp user_id ${typedId} đã nhập.`,
  missingStoredCookie: 'Thiếu cookie Seller Center của kênh.',
  dataFileUnreadable: (file: string): string =>
    `Không đọc được ${file} (đang bị khoá hoặc sai định dạng JSON). Dữ liệu không bị ghi đè; hãy sửa hoặc khôi phục file rồi thử lại.`,
  fieldMustNotBeNull: (field: string): string => `${field} must not be null`,
  userIdNeedsCookie: 'Đổi user_id cần dán cookie Seller Center mới của kênh đó.',
  backendNotConnected: 'Chưa đăng nhập backend.',
  backendUrlInvalid:
    'Địa chỉ backend của dịch vụ không hợp lệ. Hãy liên hệ quản trị viên để cài đặt lại dịch vụ.',
  backendUnreachable:
    'Không kết nối được backend. Hãy kiểm tra mạng rồi thử lại; nếu vẫn lỗi, liên hệ quản trị viên.',
  backendWrongCredentials: 'Sai email hoặc mật khẩu.',
  backendLoginRefused: (status: number, detail: string): string =>
    `Backend từ chối đăng nhập (HTTP ${status})${detail ? `: ${detail}` : '.'}`,
  backendLoginAnswerInvalid: 'Backend trả về dữ liệu đăng nhập không hợp lệ.',
  backendNotAdmin: (email: string, role: string): string =>
    `Tài khoản ${email} có quyền '${role}'; cần tài khoản admin.`,
  backendLoginExpired: 'Phiên đăng nhập backend đã hết hạn, hãy đăng nhập lại.',
  backendNoAnswer: 'Không kết nối được backend.',
  backendAnswerInvalid: 'Backend trả về dữ liệu không hợp lệ.',
  backendAnswered: (status: number, detail: string): string =>
    `Backend trả lỗi HTTP ${status}${detail ? `: ${detail}` : '.'}`,
} as const;
