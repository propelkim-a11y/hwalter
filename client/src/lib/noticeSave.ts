export interface NoticeSaveValues {
  notice: string;
  expiry: string;
  preserved: boolean;
}

/**
 * 빈 입력은 공지 삭제 의도가 아니라 다른 관리자 설정만 저장하려는 경우로 처리한다.
 * 이미 게시된 공지가 있을 때만 기존 공지와 만료일을 그대로 보존한다.
 */
export function resolveNoticeSaveValues(
  inputNotice: string,
  inputExpiry: string,
  currentNotice: string,
  currentExpiry: string,
): NoticeSaveValues {
  const normalizedInput = inputNotice.trim();
  const hasCurrentNotice = currentNotice.trim().length > 0;

  if (!normalizedInput && hasCurrentNotice) {
    return { notice: currentNotice, expiry: currentExpiry, preserved: true };
  }

  return { notice: normalizedInput, expiry: inputExpiry, preserved: false };
}
