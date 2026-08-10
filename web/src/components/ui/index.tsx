// Scholar design system — component barrel. Every page imports from
// '@/components/ui' (not the sibling files directly) so this file is the
// single public surface; keep exported names stable across redesigns.

export { Button, type ButtonProps } from './button';
export { buttonVariants, type ButtonVariantProps } from './button-variants';
export { Card, CardHeader, CardTitle, CardDescription, CardFooter, type CardProps } from './card';
export { PageHeader } from './page-header';
export { Field, inputClass, Input, Textarea, Select } from './input';
export { StatusBadge, Badge } from './badge';
export { EmptyState } from './empty-state';
export { Skeleton, CardSkeleton, Spinner, PageLoading } from './loading';
export { ErrorState, InlineError } from './error-state';
export { TableContainer, Table, THead, TBody, TR, TH, TD } from './table';
export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogFooter } from './dialog';
export { ConfirmDialog } from './confirm-dialog';
export { StatCard } from './stat-card';
export { ToastProvider, useToast } from './toast';
export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from './tooltip';
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from './dropdown-menu';
export { Popover, PopoverTrigger, PopoverClose, PopoverContent } from './popover';
