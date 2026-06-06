# B2B Exam Platform App

Ứng dụng Electron cho nền tảng thi trực tuyến (Exam Platform) với các cơ chế chống gian lận. Được xây dựng bằng Electron + Vue 3 + Vite + TypeScript + TailwindCSS.

## Yêu cầu môi trường

- **Node.js**: >= 18 (khuyến nghị 20 LTS)
- **Trình quản lý gói**: `pnpm` (khuyến nghị, dự án có `pnpm-workspace.yaml` và `pnpm-lock.yaml`) hoặc `npm`
- **Hệ điều hành**: macOS, Windows, hoặc Linux
- Để build bản cài đặt cho Windows / macOS / Linux cần máy chạy đúng hệ điều hành tương ứng (hoặc cấu hình cross-build).

## Cài đặt

```bash
# Clone repo (nếu chưa có)
git clone <repo-url>
cd b2b-exam-planform-app

# Cài dependencies
pnpm install
# hoặc
npm install
```

## Cấu hình biến môi trường

Tạo file `.env` ở thư mục gốc (sao chép từ `.env.example`):

```bash
cp .env.example .env
```

Các biến cần cấu hình:

| Biến | Mô tả |
| --- | --- |
| `VITE_APP_NAME` | Tên hiển thị của ứng dụng (mặc định: `Exam Platform`) |
| `VITE_EXAM_URL` | URL trang thi sẽ được tải trong cửa sổ Electron |

## Chạy ở chế độ dev

```bash
pnpm dev
# hoặc
npm run dev
```

Lệnh này khởi động Vite dev server cùng với Electron, hỗ trợ hot-reload cho cả tiến trình `main`, `preload` và `renderer`.

## Build production

```bash
# Build assets (Vite + tsc) — không đóng gói installer
pnpm build

# Chạy thử bản đã build mà không đóng gói
pnpm build:unpack

# Đóng gói installer theo nền tảng
pnpm build:win     # Windows (.exe NSIS)
pnpm build:mac     # macOS (.dmg, x64 + arm64)
pnpm build:linux   # Linux (AppImage)
```

Kết quả build nằm trong thư mục `dist/`.

## Cấu trúc thư mục

```
.
├── build/                  # Tài nguyên cho electron-builder (entitlements, icon, ...)
├── resources/              # Tài nguyên runtime đóng gói cùng app
├── src/
│   ├── main/               # Tiến trình main của Electron
│   │   ├── commands/
│   │   ├── constants/
│   │   ├── handlers/       # IPC handlers
│   │   ├── services/
│   │   ├── utils/
│   │   └── index.ts        # Entry của tiến trình main
│   ├── preload/            # Script preload (cầu nối main ↔ renderer)
│   └── renderer/           # Ứng dụng Vue 3 (UI)
├── electron-builder.json   # Cấu hình đóng gói
├── vite.config.ts          # Cấu hình Vite + plugin Electron
└── package.json
```

## Scripts hữu ích

| Script | Mô tả |
| --- | --- |
| `pnpm dev` | Chạy app ở chế độ phát triển |
| `pnpm clean` | Xoá thư mục `dist` và `dist-electron` |
| `pnpm build` | Clean + build production |
| `pnpm start` | Chạy Electron với bản build hiện có |
| `pnpm build:unpack` | Build và xuất thư mục app chưa đóng gói (debug) |
| `pnpm build:win` / `:mac` / `:linux` | Đóng gói installer theo nền tảng |

## Khắc phục sự cố

- **Electron không khởi động sau khi `pnpm dev`**: kiểm tra Node.js >= 18, xoá `node_modules` và cài lại.
- **Trang thi không hiển thị**: kiểm tra biến `VITE_EXAM_URL` trong `.env` đã trỏ đúng URL hay chưa.
- **Build macOS lỗi ký số**: build thử với `pnpm build:unpack` trước; với bản phân phối cần cấu hình chứng chỉ Apple Developer cho `electron-builder`.
- **Reset hoàn toàn**: `pnpm clean && rm -rf node_modules && pnpm install`.