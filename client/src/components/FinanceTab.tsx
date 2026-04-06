import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient as qc, apiRequest } from '@/lib/queryClient';
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, PlusCircle, Pencil, Trash2,
  BarChart3, ListOrdered, Settings2, Clock, CheckCircle2, AlertCircle
} from 'lucide-react';
import type { ExpenseCategory, ExpenseWithCategory, FinanceSummary } from '@shared/schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAed(v: number): string {
  return `AED ${v.toLocaleString()}`;
}

function monthLabel(iso: string): string {
  return format(parseISO(iso + '-01'), 'MMM yyyy');
}

// ─── Period Preset ────────────────────────────────────────────────────────────

type Preset = 'thisMonth' | 'last3Months' | 'thisYear' | 'allTime';

const PRESET_LABELS: Record<Preset, string> = {
  thisMonth:   'This Month',
  last3Months: 'Last 3 Months',
  thisYear:    'This Year',
  allTime:     'All Time',
};

function getPresetDates(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
  switch (preset) {
    case 'thisMonth':
      return { from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)) };
    case 'last3Months':
      return { from: fmt(startOfMonth(subMonths(now, 2))), to: fmt(endOfMonth(now)) };
    case 'thisYear':
      return { from: `${now.getFullYear()}-01-01`, to: fmt(endOfMonth(now)) };
    case 'allTime':
      return { from: '2020-01-01', to: fmt(endOfMonth(now)) };
  }
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: FinanceSummary }) {
  const net = summary.netProfitAed;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Revenue Collected</CardTitle>
          <DollarSign className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="finance-revenue-collected">
            {fmtAed(summary.revenue.collectedAed)}
          </p>
          {summary.revenue.chargedAed > summary.revenue.collectedAed && (
            <p className="text-xs text-muted-foreground mt-1">
              {fmtAed(summary.revenue.chargedAed)} charged
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Pending Cash</CardTitle>
          <Clock className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="finance-pending-cash">
            {fmtAed(summary.revenue.pendingCashAed)}
          </p>
          {summary.revenue.lateFeesAed > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              +{fmtAed(summary.revenue.lateFeesAed)} late fees
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
          <Wallet className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-destructive" data-testid="finance-total-expenses">
            {fmtAed(summary.expenses.totalAed)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Net P&L</CardTitle>
          {net >= 0
            ? <TrendingUp className="w-4 h-4 text-green-500" />
            : <TrendingDown className="w-4 h-4 text-destructive" />}
        </CardHeader>
        <CardContent>
          <p
            className={`text-2xl font-bold ${net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
            data-testid="finance-net-profit"
          >
            {net < 0 ? '-' : ''}{fmtAed(Math.abs(net))}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Monthly Table ─────────────────────────────────────────────────────────────

function MonthlyTable({ rows }: { rows: FinanceSummary['monthlyRows'] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No monthly data in this period.</p>;
  }
  const totalRev = rows.reduce((s, r) => s + r.revenueCollectedAed, 0);
  const totalExp = rows.reduce((s, r) => s + r.expensesAed, 0);
  const totalNet = rows.reduce((s, r) => s + r.netAed, 0);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-medium">Month</th>
            <th className="text-right p-3 font-medium">Revenue</th>
            <th className="text-right p-3 font-medium">Expenses</th>
            <th className="text-right p-3 font-medium">Net P&L</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map(r => (
            <tr key={r.month} className="border-b last:border-0 hover-elevate">
              <td className="p-3 font-medium">{monthLabel(r.month)}</td>
              <td className="p-3 text-right text-green-600 dark:text-green-400">{fmtAed(r.revenueCollectedAed)}</td>
              <td className="p-3 text-right text-destructive">{fmtAed(r.expensesAed)}</td>
              <td className={`p-3 text-right font-semibold ${r.netAed >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                {r.netAed < 0 ? '-' : ''}{fmtAed(Math.abs(r.netAed))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/50 font-semibold">
            <td className="p-3">Total</td>
            <td className="p-3 text-right text-green-600 dark:text-green-400">{fmtAed(totalRev)}</td>
            <td className="p-3 text-right text-destructive">{fmtAed(totalExp)}</td>
            <td className={`p-3 text-right font-bold ${totalNet >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {totalNet < 0 ? '-' : ''}{fmtAed(Math.abs(totalNet))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Expense Category Breakdown ───────────────────────────────────────────────

function CategoryBreakdown({ byCategory }: { byCategory: FinanceSummary['expenses']['byCategory'] }) {
  if (byCategory.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No expenses in this period.</p>;
  }
  const total = byCategory.reduce((s, c) => s + c.totalAed, 0);
  return (
    <div className="space-y-3">
      {byCategory.map(cat => {
        const pct = total > 0 ? Math.round((cat.totalAed / total) * 100) : 0;
        return (
          <div key={cat.id} className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-medium truncate">{cat.name}</span>
                <span className="text-sm font-semibold whitespace-nowrap">{fmtAed(cat.totalAed)}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: cat.color }}
                />
              </div>
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Expense Form Dialog ───────────────────────────────────────────────────────

interface ExpenseFormData {
  categoryId: string;
  amountAed: string;
  description: string;
  vendor: string;
  date: string;
  notes: string;
}

function ExpenseFormDialog({
  open,
  onClose,
  categories,
  editExpense,
}: {
  open: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  editExpense?: ExpenseWithCategory;
}) {
  const { toast } = useToast();
  const isEdit = !!editExpense;
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const [form, setForm] = useState<ExpenseFormData>({
    categoryId: editExpense?.categoryId ?? (categories[0]?.id ?? ''),
    amountAed: editExpense?.amountAed?.toString() ?? '',
    description: editExpense?.description ?? '',
    vendor: editExpense?.vendor ?? '',
    date: editExpense?.date ? format(new Date(editExpense.date), 'yyyy-MM-dd') : todayStr,
    notes: editExpense?.notes ?? '',
  });

  const setField = useCallback((field: keyof ExpenseFormData, value: string) => {
    setForm(f => ({ ...f, [field]: value }));
  }, []);

  const mutation = useMutation({
    mutationFn: async (data: object) => {
      if (isEdit) return apiRequest('PATCH', `/api/finance/expenses/${editExpense!.id}`, data);
      return apiRequest('POST', '/api/finance/expenses', data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/finance/expenses'] });
      qc.invalidateQueries({ queryKey: ['/api/finance/summary'] });
      toast({ title: isEdit ? 'Expense updated' : 'Expense added' });
      onClose();
    },
    onError: (err: unknown) => {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save expense', variant: 'destructive' });
    },
  });

  const submit = () => {
    const amt = parseInt(form.amountAed, 10);
    if (!form.categoryId) return toast({ title: 'Select a category', variant: 'destructive' });
    if (isNaN(amt) || amt <= 0) return toast({ title: 'Enter a valid amount', variant: 'destructive' });
    if (!form.description.trim()) return toast({ title: 'Description is required', variant: 'destructive' });
    if (!form.date) return toast({ title: 'Select a date', variant: 'destructive' });

    mutation.mutate({
      categoryId: form.categoryId,
      amountAed: amt,
      description: form.description.trim(),
      vendor: form.vendor.trim() || null,
      date: form.date,
      notes: form.notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={form.date}
                onChange={e => setField('date', e.target.value)}
                data-testid="input-expense-date"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Amount (AED)</label>
              <Input
                type="number"
                min="1"
                placeholder="500"
                value={form.amountAed}
                onChange={e => setField('amountAed', e.target.value)}
                data-testid="input-expense-amount"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Category</label>
            <Select value={form.categoryId} onValueChange={v => setField('categoryId', v)}>
              <SelectTrigger data-testid="select-expense-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Input
              placeholder="Court rental fee"
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              data-testid="input-expense-description"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Vendor (optional)</label>
            <Input
              placeholder="Al Wasl Sports Club"
              value={form.vendor}
              onChange={e => setField('vendor', e.target.value)}
              data-testid="input-expense-vendor"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea
              placeholder="Any additional info..."
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              className="resize-none h-20"
              data-testid="input-expense-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending} data-testid="button-save-expense">
            {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Category Form Dialog ──────────────────────────────────────────────────────

function CategoryDialog({
  open,
  onClose,
  editCat,
}: {
  open: boolean;
  onClose: () => void;
  editCat?: ExpenseCategory;
}) {
  const { toast } = useToast();
  const isEdit = !!editCat;
  const [name, setName] = useState(editCat?.name ?? '');
  const [color, setColor] = useState(editCat?.color ?? '#6B7280');
  const [icon, setIcon] = useState(editCat?.icon ?? 'circle');

  const mutation = useMutation({
    mutationFn: async (data: object) => {
      if (isEdit) return apiRequest('PATCH', `/api/finance/expense-categories/${editCat!.id}`, data);
      return apiRequest('POST', '/api/finance/expense-categories', data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/finance/expense-categories'] });
      toast({ title: isEdit ? 'Category updated' : 'Category created' });
      onClose();
    },
    onError: (err: unknown) => {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save', variant: 'destructive' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Category' : 'New Category'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder="Staff & Wages"
              value={name}
              onChange={e => setName(e.target.value)}
              data-testid="input-category-name"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border"
                data-testid="input-category-color"
              />
              <Input
                value={color}
                onChange={e => setColor(e.target.value)}
                className="font-mono"
                maxLength={7}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Icon name (lucide)</label>
            <Input
              placeholder="circle"
              value={icon}
              onChange={e => setIcon(e.target.value)}
              data-testid="input-category-icon"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate({ name: name.trim(), color, icon: icon.trim() || 'circle' })}
            disabled={mutation.isPending || !name.trim()}
            data-testid="button-save-category"
          >
            {mutation.isPending ? 'Saving...' : isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Expenses Section ──────────────────────────────────────────────────────────

function ExpensesSection({ categories }: { categories: ExpenseCategory[] }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editExpense, setEditExpense] = useState<ExpenseWithCategory | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const { data: expenses = [], isLoading } = useQuery<ExpenseWithCategory[]>({
    queryKey: ['/api/finance/expenses', filterFrom, filterTo, filterCat],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo);
      if (filterCat !== 'all') params.set('categoryId', filterCat);
      return apiRequest<ExpenseWithCategory[]>('GET', `/api/finance/expenses?${params.toString()}`);
    },
    staleTime: 30 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/finance/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/finance/expenses'] });
      qc.invalidateQueries({ queryKey: ['/api/finance/summary'] });
      setDeleteTarget(null);
      toast({ title: 'Expense deleted' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to delete', variant: 'destructive' });
    },
  });

  const total = expenses.reduce((s, e) => s + e.amountAed, 0);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <Input
            type="date"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            className="w-36"
            data-testid="input-filter-from"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <Input
            type="date"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            className="w-36"
            data-testid="input-filter-to"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Category</label>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-44" data-testid="select-filter-category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1" />
        <Button onClick={() => setShowAdd(true)} data-testid="button-add-expense">
          <PlusCircle className="w-4 h-4 mr-2" />
          Add Expense
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : expenses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No expenses yet. Add your first expense to start tracking your P&L.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Date</th>
                <th className="text-left p-3 font-medium">Description</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Category</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Vendor</th>
                <th className="text-right p-3 font-medium">Amount</th>
                <th className="p-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id} className="border-b last:border-0 hover-elevate" data-testid={`row-expense-${e.id}`}>
                  <td className="p-3 whitespace-nowrap text-muted-foreground">
                    {format(new Date(e.date), 'dd MMM yyyy')}
                  </td>
                  <td className="p-3">
                    <p className="font-medium truncate max-w-xs">{e.description}</p>
                    {e.notes && <p className="text-xs text-muted-foreground truncate max-w-xs">{e.notes}</p>}
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <Badge
                      className="no-default-hover-elevate no-default-active-elevate"
                      style={{ backgroundColor: e.categoryColor + '22', color: e.categoryColor, borderColor: e.categoryColor + '44' }}
                    >
                      {e.categoryName}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground hidden md:table-cell">{e.vendor ?? '—'}</td>
                  <td className="p-3 text-right font-semibold whitespace-nowrap">{fmtAed(e.amountAed)}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditExpense(e)} data-testid={`button-edit-expense-${e.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(e.id)} data-testid={`button-delete-expense-${e.id}`}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 border-t">
                <td colSpan={4} className="p-3 font-medium">Total</td>
                <td className="p-3 text-right font-bold">{fmtAed(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {showAdd && (
        <ExpenseFormDialog open categories={categories} onClose={() => setShowAdd(false)} />
      )}
      {editExpense && (
        <ExpenseFormDialog open categories={categories} editExpense={editExpense} onClose={() => setEditExpense(undefined)} />
      )}
      {deleteTarget && (
        <Dialog open onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Delete Expense?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deleteTarget)}
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete-expense"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Categories Section ────────────────────────────────────────────────────────

function CategoriesSection({
  categories,
  isLoading,
  expenseCountByCategoryId,
}: {
  categories: ExpenseCategory[];
  isLoading: boolean;
  expenseCountByCategoryId: Record<string, number>;
}) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editCat, setEditCat] = useState<ExpenseCategory | undefined>();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/finance/expense-categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/finance/expense-categories'] });
      toast({ title: 'Category deleted' });
    },
    onError: (err: unknown) => {
      const errObj = err as { error?: string };
      toast({ title: 'Cannot delete', description: errObj?.error ?? (err instanceof Error ? err.message : 'Failed to delete'), variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowAdd(true)} data-testid="button-add-category">
          <PlusCircle className="w-4 h-4 mr-2" />
          New Category
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No categories yet.</CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Category</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Icon</th>
                <th className="text-left p-3 font-medium">Color</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Expenses</th>
                <th className="p-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => {
                const count = expenseCountByCategoryId[cat.id] ?? 0;
                const hasLinked = count > 0;
                return (
                  <tr key={cat.id} className="border-b last:border-0 hover-elevate" data-testid={`row-category-${cat.id}`}>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                        <span className="font-medium">{cat.name}</span>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground hidden md:table-cell">{cat.icon}</td>
                    <td className="p-3">
                      <span className="font-mono text-xs text-muted-foreground">{cat.color}</span>
                    </td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell">{count > 0 ? count : '—'}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditCat(cat)} data-testid={`button-edit-category-${cat.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => !hasLinked && deleteMutation.mutate(cat.id)}
                                disabled={hasLinked || deleteMutation.isPending}
                                data-testid={`button-delete-category-${cat.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {hasLinked
                              ? `Cannot delete: ${count} expense${count !== 1 ? 's' : ''} linked. Reassign them first.`
                              : 'Delete category'}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <CategoryDialog open onClose={() => setShowAdd(false)} />}
      {editCat && <CategoryDialog open editCat={editCat} onClose={() => setEditCat(undefined)} />}
    </div>
  );
}

// ─── Pending Payments Section ─────────────────────────────────────────────────

interface PendingBookingRow {
  bookingId: string;
  userId: string;
  sessionId: string;
  amountAed: number;
  spotsBooked: number;
  bookingStatus: string;
  createdAt: string;
  playerName: string;
  playerEmail: string;
  sessionTitle: string;
  sessionDate: string;
  sessionStartTime: string;
  venueName: string;
}

interface PendingPaymentsResponse {
  totalPendingAed: number;
  months: {
    month: string;
    totalAed: number;
    count: number;
    bookings: PendingBookingRow[];
  }[];
}

function PendingPaymentsSection() {
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery<PendingPaymentsResponse>({
    queryKey: ['/api/finance/pending-payments'],
    queryFn: () => apiRequest<PendingPaymentsResponse>('GET', '/api/finance/pending-payments'),
    staleTime: 30 * 1000,
  });

  const markPaidMutation = useMutation({
    mutationFn: (bookingId: string) =>
      apiRequest('PATCH', `/api/marketplace/bookings/${bookingId}/cash-paid`, { cashPaid: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/finance/pending-payments'] });
      qc.invalidateQueries({ queryKey: ['/api/finance/summary'] });
      toast({ title: 'Payment marked as collected' });
    },
    onError: (err: unknown) => {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to mark as paid',
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Could not load pending payments.
        </CardContent>
      </Card>
    );
  }

  if (data.months.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <CheckCircle2 className="w-12 h-12 text-green-500" />
        <p className="text-lg font-semibold">All caught up!</p>
        <p className="text-sm text-muted-foreground">No pending cash payments at this time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Total banner */}
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <span className="font-semibold text-amber-800 dark:text-amber-200">
              Total Outstanding Cash
            </span>
          </div>
          <span
            className="text-2xl font-bold text-amber-700 dark:text-amber-300"
            data-testid="pending-total-aed"
          >
            {fmtAed(data.totalPendingAed)}
          </span>
        </CardContent>
      </Card>

      {/* Month groups */}
      {data.months.map(monthGroup => (
        <div key={monthGroup.month} className="space-y-2" data-testid={`pending-month-${monthGroup.month}`}>
          {/* Month header */}
          <div className="flex items-center justify-between gap-2 px-1">
            <h3 className="font-semibold text-base">
              {format(new Date(monthGroup.month + '-02'), 'MMMM yyyy')}
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" data-testid={`pending-count-${monthGroup.month}`}>
                {monthGroup.count} booking{monthGroup.count !== 1 ? 's' : ''}
              </Badge>
              <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                {fmtAed(monthGroup.totalAed)}
              </span>
            </div>
          </div>

          {/* Bookings table */}
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Player</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Session</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">Date</th>
                  <th className="text-right p-3 font-medium">Amount</th>
                  <th className="p-3 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {monthGroup.bookings.map(bk => (
                  <tr
                    key={bk.bookingId}
                    className="border-b last:border-0 hover-elevate"
                    data-testid={`pending-row-${bk.bookingId}`}
                  >
                    <td className="p-3">
                      <div>
                        <p className="font-medium">{bk.playerName}</p>
                        <p className="text-xs text-muted-foreground">{bk.playerEmail}</p>
                      </div>
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      <div>
                        <p className="font-medium">{bk.sessionTitle}</p>
                        <p className="text-xs text-muted-foreground">{bk.venueName}</p>
                      </div>
                    </td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground whitespace-nowrap">
                      {format(new Date(bk.sessionDate), 'dd MMM')}
                      {bk.sessionStartTime && (
                        <span className="ml-1 text-xs">{bk.sessionStartTime}</span>
                      )}
                      <p className="text-xs">{bk.spotsBooked} spot{bk.spotsBooked !== 1 ? 's' : ''}</p>
                    </td>
                    <td className="p-3 text-right font-semibold">
                      {fmtAed(bk.amountAed)}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markPaidMutation.mutate(bk.bookingId)}
                        disabled={markPaidMutation.isPending}
                        data-testid={`button-mark-paid-${bk.bookingId}`}
                        className="whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Mark Paid
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/50">
                  <td colSpan={5} className="p-3 font-medium">
                    <div className="flex items-center justify-between">
                      <span>Subtotal</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">
                        {fmtAed(monthGroup.totalAed)}
                      </span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Finance Tab ─────────────────────────────────────────────────────────

export default function FinanceTab() {
  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [subTab, setSubTab] = useState<'overview' | 'expenses' | 'categories' | 'pending'>('overview');
  const { from: fromStr, to: toStr } = getPresetDates(preset);

  const { data: summary, isLoading: summaryLoading } = useQuery<FinanceSummary>({
    queryKey: ['/api/finance/summary', fromStr, toStr],
    queryFn: () => apiRequest<FinanceSummary>('GET', `/api/finance/summary?from=${fromStr}&to=${toStr}`),
    staleTime: 30 * 1000,
  });

  const { data: categories = [], isLoading: catsLoading } = useQuery<ExpenseCategory[]>({
    queryKey: ['/api/finance/expense-categories'],
    queryFn: () => apiRequest<ExpenseCategory[]>('GET', '/api/finance/expense-categories'),
    staleTime: 60 * 1000,
  });

  // Fetch all expenses (no date filter) to compute per-category counts for the Categories view
  const { data: allExpenses = [] } = useQuery<ExpenseWithCategory[]>({
    queryKey: ['/api/finance/expenses', '', '', 'all'],
    queryFn: () => apiRequest<ExpenseWithCategory[]>('GET', '/api/finance/expenses'),
    staleTime: 30 * 1000,
  });

  const expenseCountByCategoryId = allExpenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.categoryId] = (acc[e.categoryId] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6 overflow-y-auto max-h-[calc(100vh-14rem)] md:max-h-none md:overflow-visible">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Finance</h2>
          <p className="text-sm text-muted-foreground">Track revenue, expenses, and profit</p>
        </div>
        {/* Pill-style period selector */}
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg" data-testid="finance-period-selector">
          {(Object.keys(PRESET_LABELS) as Preset[]).map(p => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              data-testid={`button-period-${p}`}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                preset === p
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-tabs */}
      <Tabs value={subTab} onValueChange={v => setSubTab(v as typeof subTab)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" className="flex items-center gap-2" data-testid="subtab-finance-overview">
            <BarChart3 className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex items-center gap-2" data-testid="subtab-finance-expenses">
            <ListOrdered className="w-4 h-4" />
            Expenses
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2" data-testid="subtab-finance-categories">
            <Settings2 className="w-4 h-4" />
            Categories
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center gap-2" data-testid="subtab-finance-pending">
            <Clock className="w-4 h-4" />
            Pending Payments
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {summaryLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : summary ? (
            <>
              <SummaryCards summary={summary} />
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Expenses by Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CategoryBreakdown byCategory={summary.expenses.byCategory} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Monthly P&L</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    <MonthlyTable rows={summary.monthlyRows} />
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Could not load summary.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Pending Payments ── */}
        <TabsContent value="pending" className="mt-6">
          <PendingPaymentsSection />
        </TabsContent>

        {/* ── Expenses ── */}
        <TabsContent value="expenses" className="mt-6">
          <ExpensesSection categories={categories} />
        </TabsContent>

        {/* ── Categories ── */}
        <TabsContent value="categories" className="mt-6">
          <CategoriesSection
            categories={categories}
            isLoading={catsLoading}
            expenseCountByCategoryId={expenseCountByCategoryId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
