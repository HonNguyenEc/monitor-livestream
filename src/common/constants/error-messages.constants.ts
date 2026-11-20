import { SHOPEE_ALLOWED_DOMAINS } from '../shopee/shopee-url.constants';

const LIST_SEPARATOR = ', ';

// User-facing text of every DomainException and local-request refusal; clients branch on the code.
// fieldMustNotBeNull is the exception: it is English, to read like the class-validator messages it is listed with.
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
  shopeeLiveUrlNotAllowed: `live_url của shop Shopee phải là địa chỉ https thuộc ${SHOPEE_ALLOWED_DOMAINS.join(' hoặc ')}.`,
  fieldsNotForPlatform: (platform: string, fields: string[]): string =>
    `Shop ${platform} không dùng trường: ${fields.join(LIST_SEPARATOR)}.`,
  cookieWithoutSession: (cookieName: string): string =>
    `Cookie phải có ${cookieName}: copy header "cookie" của một request tới banhang.shopee.vn.`,
  cookieInvalidCharacters:
    'Cookie có ký tự không hợp lệ (chỉ nhận ký tự ASCII in được). Hãy copy lại header "cookie".',
  sellerCenterUnreachable: 'Không kết nối được Seller Center. Hãy thử lại sau.',
  cookieRejected:
    'Seller Center từ chối cookie (hết hạn hoặc sai). Hãy đăng nhập lại và copy cookie mới.',
  cookieAccountMismatch: (username: string, accountId: number, typedId: unknown): string =>
    `Cookie thuộc tài khoản ${username} (user_id ${accountId}), không khớp user_id ${typedId} đã nhập.`,
  missingStoredCookie: 'Thiếu cookie Seller Center của shop.',
  dataFileUnreadable: (file: string): string =>
    `Không đọc được ${file} (đang bị khoá hoặc sai định dạng JSON). Dữ liệu không bị ghi đè; hãy sửa hoặc khôi phục file rồi thử lại.`,
  fieldMustNotBeNull: (field: string): string => `${field} must not be null`,
  userIdNeedsCookie: 'Đổi user_id cần dán cookie Seller Center mới của shop đó.',
  backendNotConnected: 'Chưa đăng nhập backend.',
  backendUrlInvalid: (env: string): string =>
    `${env} trong .env không hợp lệ: URL backend phải bắt đầu bằng http:// hoặc https://.`,
  backendUnreachable: (env: string): string =>
    `Không kết nối được backend. Kiểm tra ${env} trong .env và thử lại.`,
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
