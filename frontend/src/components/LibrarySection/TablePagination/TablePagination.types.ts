export interface TablePaginationProps {
  page: number;
  totalPages: number;
  shown: number;
  total: number;
  onPageChange: (page: number) => void;
}
