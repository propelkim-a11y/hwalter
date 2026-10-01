# 활터 왔소 — GitHub·Vercel 업로드 안내

이 ZIP은 최신 **활터 왔소** 소스입니다. 습사 기록의 사진·동영상·음성 첨부, 메모 전용 기록, 첨부 포함 ZIP 백업·복원과 전체 복원 전 안전 백업, 전문가 과녁 위치 CSV 복원, 전체 스크롤 습사 일지, 당근 활터 검색 우선 배치, 접힌 시수 통계의 방문 활터 수 요약까지 포함합니다.

## GitHub에 올리기

1. ZIP 압축을 풉니다.
2. 안의 `hwalter-isseo` 폴더 안 파일을 기존 GitHub 저장소의 최상위 폴더에 **덮어씁니다**.
3. 저장소 폴더에서 아래 명령을 실행합니다.

```bash
git add -A
git commit -m "최신 활터왔소 기능 업데이트"
git push
```

## Vercel 배포

GitHub 저장소가 Vercel 프로젝트에 연결되어 있으면 `git push` 후 자동 배포가 시작됩니다. Vercel의 최신 배포가 `Ready`가 된 뒤 앱을 새로고침해 확인하세요.

## 포함된 로컬 자산

이 패키지는 Manus 저장소 URL에 의존하지 않습니다. 다음 로컬 자산이 포함되어 있습니다.

| 파일 | 용도 |
|---|---|
| `client/public/samjoko-brand-mark.png` | 헤더의 삼족오 브랜드 마크 |
| `client/public/icon-192.png` | Android 설치 아이콘 |
| `client/public/icon-512.png` | Android any·maskable 아이콘 |
| `client/public/apple-touch-icon.png` | iOS 홈 화면 아이콘 |

## 배포 전 확인

- `pnpm install --frozen-lockfile`
- `pnpm run build`

Supabase의 공개 연결 정보는 기존 코드에 포함되어 있습니다. 별도 환경 변수를 사용 중인 경우 Vercel 프로젝트의 기존 설정을 유지하세요. 이 ZIP에는 비밀키나 사용자 개인 기록이 포함되어 있지 않습니다.
