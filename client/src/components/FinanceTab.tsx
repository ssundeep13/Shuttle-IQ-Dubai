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
import { useToast } from '@/hooks/use-toast';
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, PlusCircle, Pencil, Trash2,
  RefreshCw, ArrowUpRight, ArrowDownRight, Tag, ChevronDown, ChevronUp,
  BarChart3, ListOrdered, Settings2
} from 'lucide-react';
import type { ExpenseCategory, ExpenseWithCategory, FinanceSummary } from '@shared/schema';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExpenseFormData {
  categoryId: string;
  amountAed: string;
  description: string;
  vendor: string;
  date: string;
  notes: string;
}

interface CategoryFormData {
  name: string;
  icon: string;
  color: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAed(v: number): string {
  return `AED ${v.toLocaleString()}`;
}

function monthKey(d: Date): string {
  return format(d, 'yyyy-MM');
}

function monthLabel(iso: string): string {
  return format(parseISO(iso + '-01'), 'MMM yyyy');
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
          <p className="text-2xl font-bold" data-testid="finance-revenue-collected">{fmtAed(summary.revenue.collectedAed)}</p>
          {summary.revenue.pendingCashAed > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              +{fmtAed(summary.revenue.pendingCashAed)} pending cash
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
          <p className="text-2xl font-bold text-destructive" data-testid="finance-total-expenses">{fmtAed(summary.expenses.totalAed)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
          {net >= 0
            ? <TrendingUp className="w-4 h-4 text-green-500" />
            : <TrendingDown className="w-4 h-4 text-destructive" />}
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-bold ${net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`} data-testid="finance-net-profit">
            {net >= 0 ? '' : '-'}{fmtAed(Math.abs(net))}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Revenue Charged</CardTitle>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold" data-testid="finance-revenue-charged">{fmtAed(summary.revenue.chargedAed)}</p>
          {summary.revenue.lateFeesAed > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              incl. {fmtAed(summary.revenue.lateFeesAed)} late fees
            </p>
          )}
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
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-medium">Month</th>
            <th className="text-right p-3 font-medium">Revenue</th>
            <th className="text-right p-3 font-medium">Expenses</th>
            <th className="text-right p-3 font-medium">Net</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map(r => (
            <tr key={r.month} className="border-b last:border-0 hover-elevate">
              <td className="p-3 font-medium">{monthLabel(r.month)}</td>
              <td className="p-3 text-right text-green-600 dark:text-green-400">{fmtAed(r.revenueCollectedAed)}</td>
              <td className="p-3 text-right text-destructive">{fmtAed(r.expensesAed)}</td>
              <td className={`p-3 text-right font-semibold ${r.netAed >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                {r.netAed >= 0 ? '' : '-'}{fmtAed(Math.abs(r.netAed))}
              </td>
            </tr>
          ))}
        </tbody>
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
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: cat.color }}
            />
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
      if (isEdit) {
        return apiRequest('PATCH', `/api/finance/expenses/${editExpense!.id}`, data);
      }
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
    if (!form.description.trim()) return toast({ title: 'Enter a description', variant: 'destructive' });
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

          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-1">
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={form.date}
                onChange={e => setField('date', e.target.value)}
                data-testid="input-expense-date"
              />
            </div>
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

// ─── Category Management Dialog ────────────────────────────────────────────────

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
  const [form, setForm] = useState<CategoryFormData>({
    name: editCat?.name ?? '',
    icon: editCat?.icon ?? 'circle',
    color: editCat?.color ?? '#6B7280',
  });

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
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              data-testid="input-category-name"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="h-9 w-12 cursor-pointer rounded-md border"
                data-testid="input-category-color"
              />
              <Input
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="font-mono"
                maxLength={7}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate({ name: form.name.trim(), color: form.color, icon: form.icon })}
            disabled={mutation.isPending || !form.name.trim()}
            data-testid="button-save-category"
          >
            {mutation.isPending ? 'Saving...' : isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Expenses Tab Content ──────────────────────────────────────────────────────

function ExpensesSection({ categories }: { categories: ExpenseCategory[] }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editExpense, setEditExpense] = useState<ExpenseWithCategory | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>('all');

  const { data: expenses = [], isLoading } = useQuery<ExpenseWithCategory[]>({
    queryKey: ['/api/finance/expenses'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/finance/expenses');
      return res.json();
    },
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

  const filtered = filterCat === 'all' ? expenses : expenses.filter(e => e.categoryId === filterCat);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-48" data-testid="select-filter-category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setShowAdd(true)} data-testid="button-add-expense">
          <PlusCircle className="w-4 h-4 mr-2" />
          Add Expense
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No expenses recorded yet. Click "Add Expense" to get started.
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
              {filtered.map(e => (
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
                <td className="p-3 text-right font-bold">{fmtAed(filtered.reduce((s, e) => s + e.amountAed, 0))}</td>
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
            <DialogHeader>
              <DialogTitle>Delete Expense?</DialogTitle>
            </DialogHeader>
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

function CategoriesSection({ categories, isLoading }: { categories: ExpenseCategory[]; isLoading: boolean }) {
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
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      toast({ title: 'Cannot delete', description: msg, variant: 'destructive' });
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
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Category</th>
                <th className="text-left p-3 font-medium">Color</th>
                <th className="p-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat.id} className="border-b last:border-0 hover-elevate" data-testid={`row-category-${cat.id}`}>
                  <td className="p-3 font-medium">{cat.name}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-sm" style={{ backgroundColor: cat.color }} />
                      <span className="font-mono text-xs text-muted-foreground">{cat.color}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditCat(cat)} data-testid={`button-edit-category-${cat.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(cat.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-category-${cat.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <CategoryDialog open onClose={() => setShowAdd(false)} />}
      {editCat && <CategoryDialog open editCat={editCat} onClose={() => setEditCat(undefined)} />}
    </div>
  );
}

// ─── Date Range Picker ────────────────────────────────────────────────────────

type Preset = 'thisMonth' | 'lastMonth' | 'last3Months' | 'last6Months' | 'thisYear';

function getPresetDates(preset: Preset): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case 'thisMonth':
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'lastMonth': {
      const lm = subMonths(now, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    case 'last3Months':
      return { from: startOfMonth(subMonths(now, 2)), to: endOfMonth(now) };
    case 'last6Months':
      return { from: startOfMonth(subMonths(now, 5)), to: endOfMonth(now) };
    case 'thisYear':
      return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to: endOfMonth(now) };
  }
}

// ─── Main Finance Tab Component ───────────────────────────────────────────────

export function FinanceTab() {
  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [subTab, setSubTab] = useState<'overview' | 'expenses' | 'categories'>('overview');
  const { from, to } = getPresetDates(preset);
  const fromStr = format(from, 'yyyy-MM-dd');
  const toStr = format(to, 'yyyy-MM-dd');

  const { data: summary, isLoading: summaryLoading } = useQuery<FinanceSummary>({
    queryKey: ['/api/finance/summary', fromStr, toStr],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/finance/summary?from=${fromStr}&to=${toStr}`);
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const { data: categories = [], isLoading: catsLoading } = useQuery<ExpenseCategory[]>({
    queryKey: ['/api/finance/expense-categories'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/finance/expense-categories');
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const presetOptions: Array<{ value: Preset; label: string }> = [
    { value: 'thisMonth',   label: 'This Month' },
    { value: 'lastMonth',   label: 'Last Month' },
    { value: 'last3Months', label: 'Last 3 Months' },
    { value: 'last6Months', label: 'Last 6 Months' },
    { value: 'thisYear',    label: 'This Year' },
  ];

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Finance</h2>
          <p className="text-sm text-muted-foreground">Track revenue, expenses, and profit</p>
        </div>
        <Select value={preset} onValueChange={v => setPreset(v as Preset)}>
          <SelectTrigger className="w-44" data-testid="select-finance-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presetOptions.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sub-tabs */}
      <Tabs value={subTab} onValueChange={v => setSubTab(v as typeof subTab)}>
        <TabsList>
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
                  <CardContent>
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

        {/* ── Expenses ── */}
        <TabsContent value="expenses" className="mt-6">
          <ExpensesSection categories={categories} />
        </TabsContent>

        {/* ── Categories ── */}
        <TabsContent value="categories" className="mt-6">
          <CategoriesSection categories={categories} isLoading={catsLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
