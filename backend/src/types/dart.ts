// jp: OpenDART API 응답 타입 정의

// jp: DART 공시 목록 API 응답 (GET /api/list.json)
export interface DartListResponse {
  status:      string;   // jp: '000' = 성공
  message:     string;
  page_no:     number;
  page_count:  number;
  total_count: number;
  total_page:  number;
  list:        DartListItem[];
}

export interface DartListItem {
  corp_cls:         string;   // jp: Y=유가증권 K=코스닥
  corp_name:        string;
  corp_code:        string;
  stock_code:       string;
  report_nm:        string;   // jp: 공시 제목
  rcept_no:         string;   // jp: 접수번호 (중복 방지 기준)
  flr_nm:           string;   // jp: 공시 제출인
  rcept_dt:         string;   // jp: 접수일 YYYYMMDD
  rm:               string;   // jp: 비고
  pblntf_detail_ty: string;   // jp: 공시 유형
}

// jp: DART 기업 고유번호 파일 내 XML 구조
export interface DartCorpCodeXmlItem {
  corp_code:   string;
  corp_name:   string;
  stock_code:  string;
  modify_date: string;
}

// jp: DART API 에러 응답
export interface DartErrorResponse {
  status:  string;
  message: string;
}
