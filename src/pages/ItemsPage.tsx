import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, addDoc, updateDoc, deleteDoc, doc, Timestamp, limit, startAfter, endBefore, limitToLast, QueryDocumentSnapshot, getDocs, where, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Item, AppSettings } from '../types';
import { Button, Input, Card, Modal } from '../components/ui';
import { Search, Plus, Edit2, Trash2, X, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
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

export const ItemsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    category: '', 
    purchasePrice: 0, 
    wholesalePrice: 0, 
    retailPrice: 0, 
    unitsPerCarton: 1,
    tax: 0
  });
  const [loading, setLoading] = useState(true);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Pagination state
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [firstDoc, setFirstDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 10;

  const fetchItems = async (direction: 'next' | 'prev' | 'initial' = 'initial', searchTerm = search) => {
    setLoading(true);
    try {
      let q = query(
        collection(db, 'items'), 
        orderBy('name'), 
        limit(PAGE_SIZE + 1)
      );

      if (searchTerm) {
        q = query(
          collection(db, 'items'),
          orderBy('name'),
          where('name', '>=', searchTerm),
          where('name', '<=', searchTerm + '\uf8ff'),
          limit(PAGE_SIZE + 1)
        );
      }

      if (direction === 'next' && lastDoc) {
        q = query(q, startAfter(lastDoc));
      } else if (direction === 'prev' && firstDoc) {
        q = query(q, endBefore(firstDoc), limitToLast(PAGE_SIZE));
      }

      const snapshot = await getDocs(q);
      const docs = snapshot.docs;
      
      let results = docs.map(doc => ({ id: doc.id, ...doc.data() } as Item));
      
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

      setItems(results);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'items');
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

    const delayDebounceFn = setTimeout(() => {
      setPage(1);
      setFirstDoc(null);
      setLastDoc(null);
      fetchItems('initial', search);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const handleNextPage = () => {
    setPage(p => p + 1);
    fetchItems('next');
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage(p => p - 1);
      fetchItems('prev');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await updateDoc(doc(db, 'items', editingItem.id!), formData);
        toast.success('Item updated');
      } else {
        await addDoc(collection(db, 'items'), {
          ...formData,
          stock: 0, // Default stock to 0 if not provided
          createdAt: Timestamp.now()
        });
        toast.success('Item added');
      }
      setIsModalOpen(false);
      setEditingItem(null);
      setFormData({ 
        name: '', 
        category: '', 
        purchasePrice: 0, 
        wholesalePrice: 0, 
        retailPrice: 0, 
        unitsPerCarton: 1,
        tax: 0
      });
      fetchItems(); // Refresh current page
    } catch (error) {
      const msg = handleFirestoreError(error, editingItem ? OperationType.UPDATE : OperationType.CREATE, 'items');
      toast.error(msg);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteDoc(doc(db, 'items', itemToDelete));
      toast.success('Item deleted');
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
      fetchItems(); // Refresh current page
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  const currency = appSettings?.currencySymbol || '$';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search items by name or category..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isAdmin && (
          <Button onClick={() => setIsModalOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Item
          </Button>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
              <tr>
                <th className="px-6 py-3 font-medium">Item Name</th>
                <th className="px-6 py-3 font-medium">Category</th>
                <th className="px-6 py-3 font-medium">Purchase</th>
                <th className="px-6 py-3 font-medium">Wholesale</th>
                <th className="px-6 py-3 font-medium">Retail</th>
                <th className="px-6 py-3 font-medium">Stock</th>
                <th className="px-6 py-3 font-medium">Units/Carton</th>
                <th className="px-6 py-3 font-medium">Tax (%)</th>
                {isAdmin && <th className="px-6 py-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{item.name}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{item.category}</td>
                  <td className="px-6 py-4 text-gray-900 dark:text-white">{currency}{item.purchasePrice?.toLocaleString()}</td>
                  <td className="px-6 py-4 text-gray-900 dark:text-white">{currency}{item.wholesalePrice?.toLocaleString()}</td>
                  <td className="px-6 py-4 text-gray-900 dark:text-white">{currency}{item.retailPrice?.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "font-medium",
                        item.stock <= 5 ? "text-red-600" : "text-gray-900 dark:text-white"
                      )}>
                        {formatStock(item.stock, item.unitsPerCarton)}
                      </span>
                      {item.stock <= 5 && <AlertTriangle className="h-4 w-4 text-red-600" />}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{item.unitsPerCarton}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{item.tax}%</td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            setEditingItem(item);
                            setFormData({ 
                              name: item.name || '', 
                              category: item.category || '', 
                              purchasePrice: item.purchasePrice || 0, 
                              wholesalePrice: item.wholesalePrice || 0, 
                              retailPrice: item.retailPrice || 0, 
                              unitsPerCarton: item.unitsPerCarton || 1,
                              tax: item.tax || 0
                            });
                            setIsModalOpen(true);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-600" 
                          onClick={() => {
                            setItemToDelete(item.id!);
                            setIsDeleteModalOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="px-6 py-8 text-center text-gray-500">No items found</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="px-6 py-8 text-center text-gray-500">Loading...</td>
                </tr>
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

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsModalOpen(false)} />
          <Card className="relative w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editingItem ? 'Edit Item' : 'Add New Item'}</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Item Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <Input
                label="Category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
              <div className="grid grid-cols-3 gap-4">
                <Input
                  label="Purchase"
                  type="number"
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: Number(e.target.value) })}
                  required
                />
                <Input
                  label="Wholesale"
                  type="number"
                  value={formData.wholesalePrice}
                  onChange={(e) => setFormData({ ...formData, wholesalePrice: Number(e.target.value) })}
                  required
                />
                <Input
                  label="Retail"
                  type="number"
                  value={formData.retailPrice}
                  onChange={(e) => setFormData({ ...formData, retailPrice: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Units per Carton"
                  type="number"
                  value={formData.unitsPerCarton}
                  onChange={(e) => setFormData({ ...formData, unitsPerCarton: Number(e.target.value) })}
                  required
                />
                <Input
                  label="Tax (%)"
                  type="number"
                  value={formData.tax}
                  onChange={(e) => setFormData({ ...formData, tax: Number(e.target.value) })}
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                {editingItem ? 'Update Item' : 'Add Item'}
              </Button>
            </form>
          </Card>
        </div>
      )}
      {isDeleteModalOpen && (
        <Modal 
          isOpen={isDeleteModalOpen} 
          onClose={() => setIsDeleteModalOpen(false)} 
          title="Confirm Delete"
        >
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">Are you sure you want to delete this item? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete}>Delete Item</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
