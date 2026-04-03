import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, addDoc, doc, Timestamp, runTransaction, getDocs, deleteDoc, updateDoc, limit, startAfter, endBefore, limitToLast, QueryDocumentSnapshot, where, getDoc, getDocFromServer } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Invoice, Customer, Item, InvoiceItem, Route, AppSettings } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, Card, Modal } from '../components/ui';
import { Plus, Trash2, Save, Download, Edit2, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { formatStock } from '../lib/stockUtils';
import { Pagination } from '../components/Pagination';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return error instanceof Error ? error.message : 'Operation failed';
}

export const InvoicesPage: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Pagination state
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [firstDoc, setFirstDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 10;

  const fetchInvoices = async (direction: 'next' | 'prev' | 'initial' = 'initial') => {
    setLoading(true);
    try {
      let q = query(
        collection(db, 'invoices'), 
        orderBy('createdAt', 'desc'), 
        limit(PAGE_SIZE + 1)
      );

      if (direction === 'next' && lastDoc) {
        q = query(
          collection(db, 'invoices'),
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(PAGE_SIZE + 1)
        );
      } else if (direction === 'prev' && firstDoc) {
        q = query(
          collection(db, 'invoices'),
          orderBy('createdAt', 'desc'),
          endBefore(firstDoc),
          limitToLast(PAGE_SIZE)
        );
      }

      const snapshot = await getDocs(q);
      const docs = snapshot.docs;
      
      let results = docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
      
      if (direction === 'initial' || direction === 'next') {
        const more = results.length > PAGE_SIZE;
        if (more) results = results.slice(0, PAGE_SIZE);
        setHasMore(more);
        if (results.length > 0) {
          setFirstDoc(docs[0]);
          setLastDoc(docs[results.length - 1]);
        }
      } else if (direction === 'prev') {
        setHasMore(true);
        if (results.length > 0) {
          setFirstDoc(docs[0]);
          setLastDoc(docs[results.length - 1]);
        }
      }

      setInvoices(results);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
        if (settingsSnap.exists()) {
          setAppSettings(settingsSnap.data() as AppSettings);
        } else {
          setAppSettings({
            stockValidationOnSales: true,
            distributionName: 'My Distribution',
            distributionAddress: '123 Street, City',
            distributionPhone: '0000-0000000',
            currencySymbol: '$',
            updatedAt: Timestamp.now(),
          });
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };
    fetchSettings();
    fetchInvoices();
  }, []);

  const handleNextPage = () => {
    setPage(p => p + 1);
    fetchInvoices('next');
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage(p => p - 1);
      fetchInvoices('prev');
    }
  };

  const handleDelete = async () => {
    if (!invoiceToDelete) return;
    setDeleting(true);
    try {
      await runTransaction(db, async (transaction) => {
        // 1. Perform all reads first
        const itemSnaps: Record<string, any> = {};
        for (const invItem of invoiceToDelete.items) {
          const itemRef = doc(db, 'items', invItem.itemId);
          const snap = await transaction.get(itemRef);
          if (snap.exists()) {
            itemSnaps[invItem.itemId] = snap.data();
          }
        }

        // 2. Perform all writes
        for (const invItem of invoiceToDelete.items) {
          const itemData = itemSnaps[invItem.itemId];
          if (itemData) {
            const itemRef = doc(db, 'items', invItem.itemId);
            transaction.update(itemRef, { stock: itemData.stock + invItem.quantity });
          }
        }
        
        // Delete invoice
        transaction.delete(doc(db, 'invoices', invoiceToDelete.id!));
      });
      toast.success('Invoice deleted and stock reverted');
      setIsDeleteModalOpen(false);
      setInvoiceToDelete(null);
      fetchInvoices(); // Refresh current page
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete invoice');
    } finally {
      setDeleting(false);
    }
  };

  const generatePDF = async (invoice: Invoice) => {
    const loadingToast = toast.loading('Preparing PDF...');
    try {
      // Fetch Customer and Route data
      const customerSnap = await getDoc(doc(db, 'customers', invoice.customerId));
      const customer = customerSnap.exists() ? customerSnap.data() as Customer : null;
      
      let route: Route | null = null;
      if (customer?.routeId) {
        const routeSnap = await getDoc(doc(db, 'routes', customer.routeId));
        route = routeSnap.exists() ? routeSnap.data() as Route : null;
      }

      // Fetch settings if not already loaded
      let settings = appSettings;
      if (!settings) {
        const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
        settings = settingsSnap.exists() ? settingsSnap.data() as AppSettings : {
          stockValidationOnSales: true,
          distributionName: 'My Distribution',
          distributionAddress: '123 Street, City',
          distributionPhone: '0000-0000000',
          currencySymbol: '$',
          updatedAt: Timestamp.now(),
        };
      }

      const pdfDoc = new jsPDF();
      const currency = settings.currencySymbol || '$';
      
      // Header - Distribution Info
      pdfDoc.setFontSize(22);
      pdfDoc.setTextColor(40, 40, 40);
      pdfDoc.text(settings.distributionName, 105, 20, { align: 'center' });
      
      pdfDoc.setFontSize(10);
      pdfDoc.setTextColor(100, 100, 100);
      pdfDoc.text(settings.distributionAddress, 105, 26, { align: 'center' });
      pdfDoc.text(`Phone: ${settings.distributionPhone}`, 105, 31, { align: 'center' });
      
      pdfDoc.setDrawColor(200, 200, 200);
      pdfDoc.line(20, 35, 190, 35);

      // Document Title
      pdfDoc.setFontSize(16);
      pdfDoc.setTextColor(60, 60, 60);
      pdfDoc.text('INVOICE', 105, 45, { align: 'center' });
      
      // Invoice Details
      pdfDoc.setFontSize(10);
      pdfDoc.setTextColor(100, 100, 100);
      pdfDoc.text(`Invoice #: ${invoice.invoiceNumber}`, 20, 55);
      pdfDoc.text(`Date: ${format(invoice.createdAt.toDate(), 'PPP')}`, 20, 60);
      
      // Customer Details
      pdfDoc.setFontSize(12);
      pdfDoc.setTextColor(0, 0, 0);
      pdfDoc.text('Bill To:', 20, 75);
      pdfDoc.setFontSize(14);
      pdfDoc.text(invoice.customerName, 20, 82);
      pdfDoc.setFontSize(10);
      pdfDoc.setTextColor(80, 80, 80);
      if (customer) {
        pdfDoc.text(`Phone: ${customer.phone}`, 20, 88);
        pdfDoc.text(`Address: ${customer.address}`, 20, 93);
        pdfDoc.text(`Type: ${customer.type.toUpperCase()}`, 20, 98);
      }

      // Route Details
      if (route) {
        pdfDoc.setFontSize(12);
        pdfDoc.setTextColor(0, 0, 0);
        pdfDoc.text('Route Details:', 120, 75);
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(80, 80, 80);
        pdfDoc.text(`Route: ${route.routeName}`, 120, 82);
        pdfDoc.text(`Vehicle: ${route.vehicleName}`, 120, 87);
        pdfDoc.text(`Salesman: ${route.salesmanName} (${route.salesmanNumber})`, 120, 92);
        pdfDoc.text(`Delivery: ${route.deliveryManName} (${route.deliveryManNumber})`, 120, 97);
        pdfDoc.text(`Day: ${route.routeDay}`, 120, 102);
      }

      // Items Table
      const tableData = invoice.items.map(item => [
        item.name, 
        formatStock(item.quantity, item.unitsPerCarton), 
        `${currency}${item.price.toFixed(2)}`, 
        `${currency}${item.discount.toFixed(2)}`, 
        `${item.tax || 0}%`,
        `${currency}${item.total.toFixed(2)}`
      ]);
      
      autoTable(pdfDoc, { 
        startY: 110, 
        head: [['Item', 'Qty (Ctn/Pcs)', 'Price', 'Disc', 'Tax', 'Total']], 
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [66, 133, 244] }
      });

      const finalY = (pdfDoc as any).lastAutoTable.finalY;
      
      // Summary
      pdfDoc.setFontSize(10);
      pdfDoc.setTextColor(100, 100, 100);
      pdfDoc.text(`Subtotal:`, 140, finalY + 15);
      pdfDoc.text(`${currency}${invoice.subTotal.toFixed(2)}`, 180, finalY + 15, { align: 'right' });
      
      pdfDoc.text(`Discount:`, 140, finalY + 20);
      pdfDoc.text(`${currency}${invoice.totalDiscount.toFixed(2)}`, 180, finalY + 20, { align: 'right' });
      
      pdfDoc.text(`Tax:`, 140, finalY + 25);
      pdfDoc.text(`${currency}${(invoice.totalTax || 0).toFixed(2)}`, 180, finalY + 25, { align: 'right' });
      
      pdfDoc.setFontSize(14);
      pdfDoc.setTextColor(0, 0, 0);
      pdfDoc.text(`Grand Total:`, 140, finalY + 37);
      pdfDoc.text(`${currency}${invoice.grandTotal.toFixed(2)}`, 180, finalY + 37, { align: 'right' });

      pdfDoc.save(`Invoice-${invoice.invoiceNumber}.pdf`);
      toast.success('PDF Downloaded');
    } catch (error) {
      console.error('PDF Error:', error);
      toast.error('Failed to generate PDF');
    } finally {
      toast.dismiss(loadingToast);
    }
  };

  if (isCreating || editingInvoice) {
    return (
      <InvoiceForm 
        initialInvoice={editingInvoice} 
        onCancel={() => {
          setIsCreating(false);
          setEditingInvoice(null);
        }} 
        onSuccess={() => fetchInvoices()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Manage Invoices</h2>
        <Button onClick={() => setIsCreating(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Invoice
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
              <tr>
                <th className="px-6 py-3 font-medium">Invoice #</th>
                <th className="px-6 py-3 font-medium">Customer</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Items</th>
                <th className="px-6 py-3 font-medium">Total</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-4 font-medium text-blue-600 dark:text-blue-400">{invoice.invoiceNumber}</td>
                  <td className="px-6 py-4 text-gray-900 dark:text-white">{invoice.customerName}</td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{format(invoice.createdAt.toDate(), 'MMM dd, yyyy')}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{invoice.items.length} items</td>
                  <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{appSettings?.currencySymbol || '$'}{invoice.grandTotal.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => generatePDF(invoice)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingInvoice(invoice)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => {
                        setInvoiceToDelete(invoice);
                        setIsDeleteModalOpen(true);
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && !loading && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No invoices found</td></tr>
              )}
              {loading && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading...</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination 
          onNext={handleNextPage}
          onPrevious={handlePrevPage}
          hasMore={hasMore}
          isFirstPage={page === 1}
          loading={loading}
        />
      </Card>

      {isDeleteModalOpen && (
        <Modal 
          isOpen={isDeleteModalOpen} 
          onClose={() => setIsDeleteModalOpen(false)} 
          title="Confirm Delete Invoice"
        >
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Are you sure you want to delete invoice <strong>{invoiceToDelete?.invoiceNumber}</strong>? 
              This will also revert the stock changes for all items in this invoice.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete} loading={deleting}>Delete Invoice</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const InvoiceForm: React.FC<{ initialInvoice?: Invoice | null; onCancel: () => void; onSuccess: () => void }> = ({ initialInvoice, onCancel, onSuccess }) => {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    const fetchBaseData = async () => {
      // Fetch settings
      const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
      if (settingsSnap.exists()) {
        setAppSettings(settingsSnap.data() as AppSettings);
      } else {
        setAppSettings({ stockValidationOnSales: true, updatedAt: Timestamp.now() });
      }

      const cSnap = await getDocs(collection(db, 'customers'));
      const iSnap = await getDocs(collection(db, 'items'));
      const rSnap = await getDocs(collection(db, 'routes'));
      const fetchedCustomers = cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      const fetchedRoutes = rSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Route));
      
      setCustomers(fetchedCustomers);
      setItems(iSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item)));
      setRoutes(fetchedRoutes);

      if (initialInvoice) {
        const customer = fetchedCustomers.find(c => c.id === initialInvoice.customerId);
        setSelectedCustomer(customer || null);
        if (customer?.routeId) {
          setSelectedRouteId(customer.routeId);
        }
        setInvoiceItems(initialInvoice.items);
      }
    };
    fetchBaseData();
  }, [initialInvoice]);

  const filteredCustomers = selectedRouteId 
    ? customers.filter(c => c.routeId === selectedRouteId)
    : customers;

  const addItem = (item: Item) => {
    if (!selectedCustomer) return toast.error('Please select a customer first');
    
    let price = item.retailPrice || 0;
    if (selectedCustomer.type === 'wholesale') price = item.wholesalePrice || 0;
    if (selectedCustomer.type === 'supplier') price = item.purchasePrice || 0;

    const existing = invoiceItems.find(i => i.itemId === item.id);
    if (existing) {
      setInvoiceItems(invoiceItems.map(i => {
        if (i.itemId === item.id) {
          const newQty = i.quantity + 1;
          const discounted = (newQty * i.price) - i.discount;
          const taxAmount = discounted * (i.tax / 100);
          return { 
            ...i, 
            quantity: newQty, 
            taxAmount,
            total: discounted + taxAmount 
          };
        }
        return i;
      }));
    } else {
      const tax = item.tax || 0;
      const taxAmount = price * (tax / 100);
      setInvoiceItems([...invoiceItems, { 
        itemId: item.id!, 
        name: item.name, 
        quantity: 1, 
        unitsPerCarton: item.unitsPerCarton || 1,
        price: price, 
        discount: 0, 
        tax: tax,
        taxAmount: taxAmount,
        total: price + taxAmount 
      }]);
    }
  };

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId) || null;
    setSelectedCustomer(customer);
    
    if (customer && invoiceItems.length > 0) {
      // Update prices of existing items based on new customer type
      setInvoiceItems(invoiceItems.map(invItem => {
        const originalItem = items.find(i => i.id === invItem.itemId);
        if (originalItem) {
          let newPrice = originalItem.retailPrice || 0;
          if (customer.type === 'wholesale') newPrice = originalItem.wholesalePrice || 0;
          if (customer.type === 'supplier') newPrice = originalItem.purchasePrice || 0;
          
          const discounted = (invItem.quantity * newPrice) - invItem.discount;
          const taxAmount = discounted * (invItem.tax / 100);
          
          return {
            ...invItem,
            price: newPrice,
            taxAmount,
            total: discounted + taxAmount
          };
        }
        return invItem;
      }));
    }
  };

  const removeItem = (itemId: string) => setInvoiceItems(invoiceItems.filter(i => i.itemId !== itemId));

  const updateItem = (itemId: string, field: keyof InvoiceItem, value: any) => {
    setInvoiceItems(invoiceItems.map(item => {
      if (item.itemId === itemId) {
        const updated = { ...item, [field]: value };
        const discounted = (updated.quantity * updated.price) - updated.discount;
        updated.taxAmount = discounted * (updated.tax / 100);
        updated.total = discounted + updated.taxAmount;
        return updated;
      }
      return item;
    }));
  };

  const subTotal = invoiceItems.reduce((acc, item) => acc + (item.quantity * item.price), 0);
  const totalDiscount = invoiceItems.reduce((acc, item) => acc + item.discount, 0);
  const totalTax = invoiceItems.reduce((acc, item) => acc + item.taxAmount, 0);
  const grandTotal = subTotal - totalDiscount + totalTax;
  const currency = appSettings?.currencySymbol || '$';

  const handleSave = async () => {
    if (!selectedCustomer) return toast.error('Select a customer');
    if (invoiceItems.length === 0) return toast.error('Add at least one item');
    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        // Collect all item IDs involved
        const itemIds = new Set<string>();
        invoiceItems.forEach(i => itemIds.add(i.itemId));
        if (initialInvoice) {
          initialInvoice.items.forEach(i => itemIds.add(i.itemId));
        }

        // 1. Perform all reads first
        const itemSnaps: Record<string, any> = {};
        for (const itemId of itemIds) {
          const itemRef = doc(db, 'items', itemId);
          const snap = await transaction.get(itemRef);
          if (snap.exists()) {
            itemSnaps[itemId] = snap.data();
          }
        }

        // 2. Calculate stock changes
        const stockChanges: Record<string, number> = {};
        
        // Revert old quantities
        if (initialInvoice) {
          for (const oldItem of initialInvoice.items) {
            stockChanges[oldItem.itemId] = (stockChanges[oldItem.itemId] || 0) + oldItem.quantity;
          }
        }

        // Subtract new quantities
        for (const newItem of invoiceItems) {
          stockChanges[newItem.itemId] = (stockChanges[newItem.itemId] || 0) - newItem.quantity;
        }

        // 3. Apply updates and check for insufficient stock
        for (const itemId of Object.keys(stockChanges)) {
          const change = stockChanges[itemId];
          if (change === 0) continue;

          const currentData = itemSnaps[itemId];
          if (!currentData) throw new Error(`Item ${itemId} not found`);

          const newStock = currentData.stock + change;
          if (newStock < 0 && appSettings?.stockValidationOnSales) {
            const itemName = invoiceItems.find(i => i.itemId === itemId)?.name || initialInvoice?.items.find(i => i.itemId === itemId)?.name || 'Unknown Item';
            throw new Error(`Insufficient stock for ${itemName}`);
          }

          transaction.update(doc(db, 'items', itemId), { stock: newStock });
        }

        const invoiceData = {
          invoiceNumber: initialInvoice?.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
          customerId: selectedCustomer.id!,
          customerName: selectedCustomer.name,
          salesmanId: profile?.uid || '',
          salesmanName: profile?.displayName || '',
          items: invoiceItems,
          subTotal,
          totalDiscount,
          totalTax,
          grandTotal,
          createdAt: initialInvoice?.createdAt || Timestamp.now(),
          updatedAt: Timestamp.now()
        };
        
        if (initialInvoice) {
          transaction.update(doc(db, 'invoices', initialInvoice.id!), invoiceData);
        } else {
          transaction.set(doc(collection(db, 'invoices')), invoiceData);
        }
      });
      toast.success(initialInvoice ? 'Invoice updated successfully' : 'Invoice created successfully');
      onCancel();
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{initialInvoice ? 'Edit Invoice' : 'New Invoice'}</h2>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 font-semibold">Select Customer</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Filter by Route</label>
                <select 
                  className="w-full rounded-lg border border-gray-300 p-2 dark:border-gray-600 dark:bg-gray-800"
                  value={selectedRouteId}
                  onChange={(e) => setSelectedRouteId(e.target.value)}
                >
                  <option value="">All Routes</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>{r.routeName}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Customer</label>
                <select 
                  className="w-full rounded-lg border border-gray-300 p-2 dark:border-gray-600 dark:bg-gray-800" 
                  onChange={(e) => handleCustomerChange(e.target.value)} 
                  value={selectedCustomer?.id || ''}
                >
                  <option value="">Choose a customer...</option>
                  {filteredCustomers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type || 'retail'}) - {c.phone}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="mb-4 font-semibold">Invoice Items</h3>
            <div className="space-y-4">
              {invoiceItems.map((item) => (
                <div key={item.itemId} className="flex flex-wrap items-end gap-4 border-b border-gray-100 pb-4 dark:border-gray-700">
                  <div className="flex-1 min-w-[200px]"><p className="text-sm font-medium">{item.name}</p></div>
                  <div className="w-20">
                    <Input 
                      label="Ctn" 
                      type="number" 
                      value={item.unitsPerCarton > 0 ? Math.floor(item.quantity / item.unitsPerCarton) : 0} 
                      onChange={(e) => {
                        const ctns = Number(e.target.value) || 0;
                        const upc = item.unitsPerCarton || 1;
                        const pcs = item.quantity % upc;
                        updateItem(item.itemId, 'quantity', (ctns * upc) + pcs);
                      }} 
                    />
                  </div>
                  <div className="w-20">
                    <Input 
                      label="Pcs" 
                      type="number" 
                      value={item.unitsPerCarton > 0 ? item.quantity % item.unitsPerCarton : item.quantity} 
                      onChange={(e) => {
                        const pcs = Number(e.target.value) || 0;
                        const upc = item.unitsPerCarton || 1;
                        const ctns = Math.floor(item.quantity / upc);
                        updateItem(item.itemId, 'quantity', (ctns * upc) + pcs);
                      }} 
                    />
                  </div>
                  <div className="w-24"><Input label="Price" type="number" value={item.price} onChange={(e) => updateItem(item.itemId, 'price', Number(e.target.value))} /></div>
                  <div className="w-24"><Input label="Disc" type="number" value={item.discount} onChange={(e) => updateItem(item.itemId, 'discount', Number(e.target.value))} /></div>
                  <div className="w-20"><Input label="Tax %" type="number" value={item.tax} onChange={(e) => updateItem(item.itemId, 'tax', Number(e.target.value))} /></div>
                  <div className="w-24 text-right"><p className="text-xs text-gray-500">Total</p><p className="font-bold">{currency}{item.total.toFixed(2)}</p></div>
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => removeItem(item.itemId)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              {invoiceItems.length === 0 && <p className="py-8 text-center text-gray-500">No items added yet</p>}
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 font-semibold">Add Items</h3>
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {items.map(item => (
                <button key={item.id} onClick={() => addItem(item)} className="flex w-full items-center justify-between rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-gray-500">Stock: {formatStock(item.stock, item.unitsPerCarton)} ({item.unitsPerCarton} units/carton)</p>
                  </div>
                  <p className="font-bold text-blue-600">
                    {currency}{selectedCustomer?.type === 'wholesale' ? item.wholesalePrice : 
                      selectedCustomer?.type === 'supplier' ? item.purchasePrice : 
                      item.retailPrice}
                  </p>
                </button>
              ))}
            </div>
          </Card>
          <Card className="p-6 bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30">
            <h3 className="mb-4 font-bold text-lg">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{currency}{subTotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-red-600"><span>Total Discount</span><span>-{currency}{totalDiscount.toFixed(2)}</span></div>
              <div className="flex justify-between text-blue-600"><span>Total Tax</span><span>+{currency}{totalTax.toFixed(2)}</span></div>
              <div className="border-t border-blue-200 dark:border-blue-800 pt-2 mt-2 flex justify-between text-lg font-bold"><span>Grand Total</span><span>{currency}{grandTotal.toFixed(2)}</span></div>
            </div>
            <Button className="w-full mt-6 gap-2" onClick={handleSave} loading={loading}>
              <Save className="h-4 w-4" />
              {initialInvoice ? 'Update Invoice' : 'Save Invoice'}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};
