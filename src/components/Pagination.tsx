import React from 'react';
import { Button } from './ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  onNext: () => void;
  onPrevious: () => void;
  hasMore: boolean;
  isFirstPage: boolean;
  loading?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({ 
  onNext, 
  onPrevious, 
  hasMore, 
  isFirstPage,
  loading 
}) => {
  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 sm:px-6">
      <div className="flex flex-1 justify-between sm:hidden">
        <Button
          onClick={onPrevious}
          disabled={isFirstPage || loading}
          variant="ghost"
          size="sm"
        >
          Previous
        </Button>
        <Button
          onClick={onNext}
          disabled={!hasMore || loading}
          variant="ghost"
          size="sm"
        >
          Next
        </Button>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-end">
        <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
          <Button
            onClick={onPrevious}
            disabled={isFirstPage || loading}
            variant="ghost"
            className="rounded-l-md border border-gray-300 dark:border-gray-600"
          >
            <span className="sr-only">Previous</span>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
          <Button
            onClick={onNext}
            disabled={!hasMore || loading}
            variant="ghost"
            className="rounded-r-md border border-gray-300 dark:border-gray-600"
          >
            <span className="sr-only">Next</span>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Button>
        </nav>
      </div>
    </div>
  );
};
