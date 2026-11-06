// pagination (2026-11-06): the list in pages of PER_PAGE trails by name, each a static page search
// engines can read (/trails/, /trails/page/2/ …) with plain links to the others; visitors can pick
// another page size (PER_PAGE_OPTIONS, remembered in the browser), and filtered or sorted lists page
// in the browser over the same addresses, the filters in the query string
export const PER_PAGE = 24;
export const PER_PAGE_OPTIONS = [12, 24, 48, 96] as const;
export const pageCount = (trails: number, per: number = PER_PAGE) => Math.max(1, Math.ceil(trails / per));
export const pagePath = (page: number) => (page <= 1 ? "/trails/" : `/trails/page/${page}/`);
