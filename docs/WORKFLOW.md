# 작업 흐름 (브랜치 → PR → 미리보기 → merge)

`main` 브랜치 = 실서비스에 나가는 코드입니다.
`main`에 직접 커밋하지 않고, 항상 아래 순서로 작업합니다.

1. **브랜치 만들기**: 기능 하나에 브랜치 하나. 이름 예: `feat/futsal-ball-size`, `fix/wasd-keys`
2. **PR 올리기**: GitHub에 Pull Request를 엽니다. 템플릿에 "무엇을 / 완료 기준"을 적습니다.
3. **자동 확인**
   - CI(GitHub Actions): `npm test` + `npm run build`가 자동으로 돌고, 초록불/빨간불이 PR에 표시됩니다.
   - Vercel 미리보기: PR마다 미리보기 주소가 댓글로 달립니다. 휴대폰으로 열어서 확인합니다.
4. **merge**: CI 초록불 + 미리보기 확인이 끝나면 "Merge" 버튼. 이때만 실서비스에 반영됩니다.
5. **되돌리기**: 문제가 생기면 PR 화면의 "Revert" 버튼 → 새 PR을 merge하면 원래대로 돌아갑니다.

## 주의

- 미리보기도 실서비스와 같은 Neon DB를 쓸 수 있습니다. 미리보기에서 관리자로 선수 데이터를 수정하면
  실데이터가 바뀌니, UI 확인은 보기 모드로 하고 데이터 실험은 `node scripts/preview-vercel.mjs --fixture`로 합니다.
- 테스트는 `tests/*.test.cjs`, `tests/*.test.mjs`에 두면 CI가 자동으로 포함합니다.
- 로컬에서 먼저 확인: `npm test && npm run build`
