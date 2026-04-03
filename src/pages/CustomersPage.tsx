import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, addDoc, updateDoc, deleteDoc, doc, Timestamp, limit, startAfter, endBefore, limitToLast, QueryDocumentSnapshot, getDocs, where, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Customer, CustomerType, Route, AppSettings } from '../types';
import { Button, Input, Card, Modal } from '../components/ui';
import { Search, Plus, Edit2, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';
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

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [selectedRouteFilter, setSelectedRouteFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    phone: '', 
    address: '', 
    type: 'retail' as CustomerType, 
    balance: 0,
    routeId: '',
    routeName: ''
  });
  const [loading, setLoading] = useState(true);

  // Pagination state
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [firstDoc, setFirstDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 10;

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
        if (settingsDoc.exists()) {
          setAppSettings(settingsDoc.data() as AppSettings);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };
    fetchSettings();
  }, []);

  const fetchCustomers = async (direction: 'next' | 'prev' | 'initial' = 'initial', searchTerm = search, routeFilter = selectedRouteFilter) => {
    setLoading(true);
    try {
      let q = query(
        collection(db, 'customers'), 
        orderBy('name'), 
        limit(PAGE_SIZE + 1)
      );

      const constraints: any[] = [orderBy('name')];

      if (searchTerm) {
        constraints.push(where('name', '>=', searchTerm));
        constraints.push(where('name', '<=', searchTerm + '\uf8ff'));
      }

      if (routeFilter) {
        constraints.push(where('routeId', '==', routeFilter));
      }

      q = query(collection(db, 'customers'), ...constraints, limit(PAGE_SIZE + 1));

      if (direction === 'next' && lastDoc) {
        q = query(q, startAfter(lastDoc));
      } else if (direction === 'prev' && firstDoc) {
        q = query(q, endBefore(firstDoc), limitToLast(PAGE_SIZE));
      }

      const snapshot = await getDocs(q);
      const docs = snapshot.docs;
      
      let results = docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      
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

      setCustomers(results);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const q = query(collection(db, 'routes'), orderBy('routeName'));
        const snapshot = await getDocs(q);
        setRoutes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Route)));
      } catch (error) {
        console.error('Error fetching routes:', error);
      }
    };
    fetchRoutes();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setPage(1);
      setFirstDoc(null);
      setLastDoc(null);
      fetchCustomers('initial', search, selectedRouteFilter);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search, selectedRouteFilter]);

  const handleNextPage = () => {
    setPage(p => p + 1);
    fetchCustomers('next');
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage(p => p - 1);
      fetchCustomers('prev');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await updateDoc(doc(db, 'customers', editingCustomer.id!), formData);
        toast.success('Customer updated');
      } else {
        await addDoc(collection(db, 'customers'), {
          ...formData,
          createdAt: Timestamp.now()
        });
        toast.success('Customer added');
      }
      setIsModalOpen(false);
      setEditingCustomer(null);
      setFormData({ 
        name: '', 
        phone: '', 
        address: '', 
        type: 'retail', 
        balance: 0,
        routeId: '',
        routeName: ''
      });
      fetchCustomers(); // Refresh current page
    } catch (error) {
      const msg = handleFirestoreError(error, editingCustomer ? OperationType.UPDATE : OperationType.CREATE, 'customers');
      toast.error(msg);
    }
  };

  const handleDelete = async () => {
    if (!customerToDelete) return;
    try {
      await deleteDoc(doc(db, 'customers', customerToDelete));
      toast.success('Customer deleted');
      setIsDeleteModalOpen(false);
      setCustomerToDelete(null);
      fetchCustomers(); // Refresh current page
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  const currencySymbol = appSettings?.currencySymbol || '$';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-4 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search customers..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select 
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 text-sm"
            value={selectedRouteFilter}
            onChange={(e) => setSelectedRouteFilter(e.target.value)}
          >
            <option value="">All Routes</option>
            {routes.map(route => (
              <option key={route.id} value={route.id}>{route.routeName}</option>
            ))}
          </select>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
              <tr>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Phone</th>
                <th className="px-6 py-3 font-medium">Route</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Address</th>
                <th className="px-6 py-3 font-medium">Balance</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{customer.name}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{customer.phone}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{customer.routeName || 'No Route'}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      customer.type === 'retail' ? "bg-blue-100 text-blue-800" :
                      customer.type === 'wholesale' ? "bg-purple-100 text-purple-800" :
                      customer.type === 'supplier' ? "bg-orange-100 text-orange-800" :
                      "bg-gray-100 text-gray-800"
                    )}>
                      {customer.type ? customer.type.charAt(0).toUpperCase() + customer.type.slice(1) : 'Retail'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{customer.address}</td>
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{currencySymbol}{customer.balance.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          setEditingCustomer(customer);
                          setFormData({ 
                            name: customer.name || '', 
                            phone: customer.phone || '', 
                            address: customer.address || '', 
                            type: customer.type || 'retail',
                            balance: customer.balance || 0,
                            routeId: customer.routeId || '',
                            routeName: customer.routeName || ''
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
                            setCustomerToDelete(customer.id!);
                            setIsDeleteModalOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">No customers found</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading...</td>
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
              <h3 className="text-lg font-bold">{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Customer Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <Input
                label="Phone Number"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Customer Type</label>
                <select 
                  className="w-full rounded-lg border border-gray-300 p-2 dark:border-gray-600 dark:bg-gray-800"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as CustomerType })}
                  required
                >
                  <option value="retail">Retail</option>
                  <option value="wholesale">Wholesale</option>
                  <option value="supplier">Supplier</option>
                </select>
              </div>
              <Input
                label="Address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Assign Route</label>
                <select 
                  className="w-full rounded-lg border border-gray-300 p-2 dark:border-gray-600 dark:bg-gray-800"
                  value={formData.routeId}
                  onChange={(e) => {
                    const route = routes.find(r => r.id === e.target.value);
                    setFormData({ 
                      ...formData, 
                      routeId: e.target.value,
                      routeName: route ? route.routeName : ''
                    });
                  }}
                >
                  <option value="">Select Route</option>
                  {routes.map(route => (
                    <option key={route.id} value={route.id}>{route.routeName}</option>
                  ))}
                </select>
              </div>
              <Input
                label={`Opening Balance (${currencySymbol})`}
                type="number"
                value={formData.balance}
                onChange={(e) => setFormData({ ...formData, balance: Number(e.target.value) })}
              />
              <Button type="submit" className="w-full">
                {editingCustomer ? 'Update Customer' : 'Add Customer'}
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
            <p className="text-gray-600 dark:text-gray-400">Are you sure you want to delete this customer? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete}>Delete Customer</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
