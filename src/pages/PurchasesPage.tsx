import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, addDoc, doc, Timestamp, runTransaction, getDocs, deleteDoc, updateDoc, limit, startAfter, endBefore, limitToLast, QueryDocumentSnapshot, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Purchase, Customer, Item, PurchaseItem, AppSettings } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getDoc } from 'firebase/firestore';
import { Button, Input, Card, Modal } from '../components/ui';
import { Plus, Trash2, Save, Download, ShoppingCart, Edit2, ChevronLeft, ChevronRight } from 'lucide-react';
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

export const PurchasesPage: React.FC = () => {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Pagination state
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [firstDoc, setFirstDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 10;

  const fetchPurchases = async (direction: 'next' | 'prev' | 'initial' = 'initial') => {
    setLoading(true);
    try {
      let q = query(
        collection(db, 'purchases'), 
        orderBy('createdAt', 'desc'), 
        limit(PAGE_SIZE + 1)
      );

      if (direction === 'next' && lastDoc) {
        q = query(
          collection(db, 'purchases'),
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(PAGE_SIZE + 1)
        );
      } else if (direction === 'prev' && firstDoc) {
        q = query(
          collection(db, 'purchases'),
          orderBy('createdAt', 'desc'),
          endBefore(firstDoc),
          limitToLast(PAGE_SIZE)
        );
      }

      const snapshot = await getDocs(q);
      const docs = snapshot.docs;
      
      let results = docs.map(doc => ({ id: doc.id, ...doc.data() } as Purchase));
      
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

      setPurchases(results);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'purchases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      const snap = await getDoc(doc(db, 'settings', 'global'));
      if (snap.exists()) setAppSettings(snap.data() as AppSettings);
    };
    fetchSettings();
    fetchPurchases();
  }, []);

  const handleNextPage = () => {
    setPage(p => p + 1);
    fetchPurchases('next');
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage(p => p - 1);
      fetchPurchases('prev');
    }
  };

  const handleDelete = async () => {
    if (!purchaseToDelete) return;
    setDeleting(true);
    try {
      await runTransaction(db, async (transaction) => {
        // 1. Perform all reads first
        const itemSnaps: Record<string, any> = {};
        for (const pItem of purchaseToDelete.items) {
          const itemRef = doc(db, 'items', pItem.itemId);
          const snap = await transaction.get(itemRef);
          if (snap.exists()) {
            itemSnaps[pItem.itemId] = snap.data();
          }
        }

        // 2. Perform all writes
        for (const pItem of purchaseToDelete.items) {
          const itemData = itemSnaps[pItem.itemId];
          if (itemData) {
            const itemRef = doc(db, 'items', pItem.itemId);
            transaction.update(itemRef, { stock: Math.max(0, itemData.stock - pItem.quantity) });
          }
        }
        
        // Delete purchase
        transaction.delete(doc(db, 'purchases', purchaseToDelete.id!));
      });
      toast.success('Purchase deleted and stock reverted');
      setIsDeleteModalOpen(false);
      setPurchaseToDelete(null);
      fetchPurchases(); // Refresh current page
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete purchase');
    } finally {
      setDeleting(false);
    }
  };

  const generatePDF = (purchase: Purchase) => {
    const currency = appSettings?.currencySymbol || '$';
    const pdfDoc = new jsPDF();
    
    // Header - Distribution Info
    pdfDoc.setFontSize(22);
    pdfDoc.setTextColor(40, 40, 40);
    pdfDoc.text(appSettings?.distributionName || 'My Distribution', 105, 20, { align: 'center' });
    
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(100, 100, 100);
    pdfDoc.text(appSettings?.distributionAddress || '123 Street, City', 105, 26, { align: 'center' });
    pdfDoc.text(`Phone: ${appSettings?.distributionPhone || '0000-0000000'}`, 105, 31, { align: 'center' });
    
    pdfDoc.setDrawColor(200, 200, 200);
    pdfDoc.line(20, 35, 190, 35);

    // Document Title
    pdfDoc.setFontSize(16);
    pdfDoc.setTextColor(60, 60, 60);
    pdfDoc.text('PURCHASE ORDER', 105, 45, { align: 'center' });
    
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(100, 100, 100);
    pdfDoc.text(`Purchase #: ${purchase.purchaseNumber}`, 20, 55);
    pdfDoc.text(`Date: ${format(purchase.createdAt.toDate(), 'PPP')}`, 20, 60);
    
    pdfDoc.setFontSize(12);
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.text('Supplier:', 20, 75);
    pdfDoc.setFontSize(14);
    pdfDoc.text(purchase.supplierName, 20, 82);
    
    const tableData = purchase.items.map(item => [
      item.name, 
      formatStock(item.quantity, item.unitsPerCarton), 
      `${currency}${item.price.toFixed(2)}`, 
      `${currency}${item.total.toFixed(2)}`
    ]);
    
    autoTable(pdfDoc, { 
      startY: 90, 
      head: [['Item', 'Qty (Ctn/Pcs)', 'Price', 'Total']], 
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [34, 197, 94] } // Green for purchases
    });

    const finalY = (pdfDoc as any).lastAutoTable.finalY;
    pdfDoc.setFontSize(14);
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.text(`Total Amount: ${currency}${purchase.totalAmount.toFixed(2)}`, 140, finalY + 20);
    pdfDoc.save(`Purchase-${purchase.purchaseNumber}.pdf`);
  };

  const currency = appSettings?.currencySymbol || '$';

  if (isCreating || editingPurchase) {
    return (
      <PurchaseForm 
        initialPurchase={editingPurchase} 
        currencySymbol={currency}
        onCancel={() => {
          setIsCreating(false);
          setEditingPurchase(null);
        }} 
        onSuccess={() => fetchPurchases()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Manage Purchases</h2>
        <Button onClick={() => setIsCreating(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Purchase
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
              <tr>
                <th className="px-6 py-3 font-medium">Purchase #</th>
                <th className="px-6 py-3 font-medium">Supplier</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Items</th>
                <th className="px-6 py-3 font-medium">Total</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {purchases.map((purchase) => (
                <tr key={purchase.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-4 font-medium text-green-600 dark:text-green-400">{purchase.purchaseNumber}</td>
                  <td className="px-6 py-4 text-gray-900 dark:text-white">{purchase.supplierName}</td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{format(purchase.createdAt.toDate(), 'MMM dd, yyyy')}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{purchase.items.length} items</td>
                  <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{currency}{purchase.totalAmount.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => generatePDF(purchase)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingPurchase(purchase)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => {
                        setPurchaseToDelete(purchase);
                        setIsDeleteModalOpen(true);
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {purchases.length === 0 && !loading && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No purchases found</td></tr>
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
          title="Confirm Delete Purchase"
        >
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Are you sure you want to delete purchase <strong>{purchaseToDelete?.purchaseNumber}</strong>? 
              This will also decrease the stock for all items in this purchase.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete} loading={deleting}>Delete Purchase</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const PurchaseForm: React.FC<{ initialPurchase?: Purchase | null; currencySymbol: string; onCancel: () => void; onSuccess: () => void }> = ({ initialPurchase, currencySymbol, onCancel, onSuccess }) => {
  const [suppliers, setSuppliers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Customer | null>(null);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchBaseData = async () => {
      const cSnap = await getDocs(collection(db, 'customers'));
      const iSnap = await getDocs(collection(db, 'items'));
      const fetchedSuppliers = cSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Customer))
        .filter(c => c.type === 'supplier');
      
      setSuppliers(fetchedSuppliers);
      setItems(iSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item)));

      if (initialPurchase) {
        setSelectedSupplier(fetchedSuppliers.find(s => s.id === initialPurchase.supplierId) || null);
        setPurchaseItems(initialPurchase.items);
      }
    };
    fetchBaseData();
  }, [initialPurchase]);

  const addItem = (item: Item) => {
    const existing = purchaseItems.find(i => i.itemId === item.id);
    const price = item.purchasePrice || 0;
    if (existing) {
      setPurchaseItems(purchaseItems.map(i => i.itemId === item.id ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.price } : i));
    } else {
      setPurchaseItems([...purchaseItems, { 
        itemId: item.id!, 
        name: item.name, 
        quantity: 1, 
        unitsPerCarton: item.unitsPerCarton || 1,
        price: price, 
        total: price 
      }]);
    }
  };

  const removeItem = (itemId: string) => setPurchaseItems(purchaseItems.filter(i => i.itemId !== itemId));

  const updateItem = (itemId: string, field: keyof PurchaseItem, value: any) => {
    setPurchaseItems(purchaseItems.map(item => {
      if (item.itemId === itemId) {
        const updated = { ...item, [field]: value };
        updated.total = updated.quantity * updated.price;
        return updated;
      }
      return item;
    }));
  };

  const totalAmount = purchaseItems.reduce((acc, item) => acc + item.total, 0);

  const handleSave = async () => {
    if (!selectedSupplier) return toast.error('Select a supplier');
    if (purchaseItems.length === 0) return toast.error('Add at least one item');
    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        // Collect all item IDs involved
        const itemIds = new Set<string>();
        purchaseItems.forEach(i => itemIds.add(i.itemId));
        if (initialPurchase) {
          initialPurchase.items.forEach(i => itemIds.add(i.itemId));
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
        
        // Revert old quantities (if updating)
        if (initialPurchase) {
          for (const oldItem of initialPurchase.items) {
            stockChanges[oldItem.itemId] = (stockChanges[oldItem.itemId] || 0) - oldItem.quantity;
          }
        }

        // Add new quantities
        for (const newItem of purchaseItems) {
          stockChanges[newItem.itemId] = (stockChanges[newItem.itemId] || 0) + newItem.quantity;
        }

        // 3. Apply updates
        for (const itemId of Object.keys(stockChanges)) {
          const change = stockChanges[itemId];
          if (change === 0) continue;

          const currentData = itemSnaps[itemId];
          if (!currentData) continue;

          const newStock = Math.max(0, currentData.stock + change);
          transaction.update(doc(db, 'items', itemId), { stock: newStock });
        }

        const purchaseData = {
          purchaseNumber: initialPurchase?.purchaseNumber || `PUR-${Date.now().toString().slice(-6)}`,
          supplierId: selectedSupplier.id!,
          supplierName: selectedSupplier.name,
          items: purchaseItems,
          totalAmount,
          createdAt: initialPurchase?.createdAt || Timestamp.now()
        };
        
        if (initialPurchase) {
          transaction.update(doc(db, 'purchases', initialPurchase.id!), purchaseData);
        } else {
          transaction.set(doc(collection(db, 'purchases')), purchaseData);
        }
      });
      toast.success(initialPurchase ? 'Purchase updated successfully' : 'Purchase recorded successfully');
      onCancel();
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save purchase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{initialPurchase ? 'Edit Purchase' : 'New Purchase'}</h2>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 font-semibold">Select Supplier</h3>
            <select 
              className="w-full rounded-lg border border-gray-300 p-2 dark:border-gray-600 dark:bg-gray-800" 
              onChange={(e) => setSelectedSupplier(suppliers.find(s => s.id === e.target.value) || null)} 
              value={selectedSupplier?.id || ''}
            >
              <option value="">Choose a supplier...</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name} - {s.phone}</option>
              ))}
            </select>
          </Card>
          <Card className="p-6">
            <h3 className="mb-4 font-semibold">Purchase Items</h3>
            <div className="space-y-4">
              {purchaseItems.map((item) => (
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
                  <div className="w-24 text-right"><p className="text-xs text-gray-500">Total</p><p className="font-bold">{currencySymbol}{item.total.toFixed(2)}</p></div>
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => removeItem(item.itemId)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              {purchaseItems.length === 0 && <p className="py-8 text-center text-gray-500">No items added yet</p>}
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
                    <p className="text-xs text-gray-500">Stock: {formatStock(item.stock, item.unitsPerCarton)}</p>
                  </div>
                  <p className="font-bold text-green-600">{currencySymbol}{item.purchasePrice}</p>
                </button>
              ))}
            </div>
          </Card>
          <Card className="p-6 bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30">
            <h3 className="mb-4 font-bold text-lg">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-lg font-bold"><span>Total Amount</span><span>{currencySymbol}{totalAmount.toFixed(2)}</span></div>
            </div>
            <Button className="w-full mt-6 gap-2" onClick={handleSave} loading={loading} variant="primary">
              <Save className="h-4 w-4" />
              {initialPurchase ? 'Update Purchase' : 'Save Purchase'}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};
