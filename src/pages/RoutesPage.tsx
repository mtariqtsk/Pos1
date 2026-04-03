import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, addDoc, updateDoc, deleteDoc, doc, Timestamp, limit, startAfter, endBefore, limitToLast, QueryDocumentSnapshot, getDocs, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Route } from '../types';
import { Button, Input, Card, Modal } from '../components/ui';
import { Search, Plus, Edit2, Trash2, X, MapPin } from 'lucide-react';
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

export const RoutesPage: React.FC = () => {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<string | null>(null);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [formData, setFormData] = useState({
    routeName: '',
    vehicleName: '',
    salesmanName: '',
    salesmanNumber: '',
    deliveryManName: '',
    deliveryManNumber: '',
    routeDay: ''
  });
  const [loading, setLoading] = useState(true);

  // Pagination state
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [firstDoc, setFirstDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 10;

  const fetchRoutes = async (direction: 'next' | 'prev' | 'initial' = 'initial', searchTerm = search) => {
    setLoading(true);
    try {
      let q = query(
        collection(db, 'routes'), 
        orderBy('routeName'), 
        limit(PAGE_SIZE + 1)
      );

      if (searchTerm) {
        q = query(
          collection(db, 'routes'),
          orderBy('routeName'),
          where('routeName', '>=', searchTerm),
          where('routeName', '<=', searchTerm + '\uf8ff'),
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
      
      let results = docs.map(doc => ({ id: doc.id, ...doc.data() } as Route));
      
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

      setRoutes(results);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'routes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setPage(1);
      setFirstDoc(null);
      setLastDoc(null);
      fetchRoutes('initial', search);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const handleNextPage = () => {
    setPage(p => p + 1);
    fetchRoutes('next');
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage(p => p - 1);
      fetchRoutes('prev');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRoute) {
        await updateDoc(doc(db, 'routes', editingRoute.id!), formData);
        toast.success('Route updated');
      } else {
        await addDoc(collection(db, 'routes'), {
          ...formData,
          createdAt: Timestamp.now()
        });
        toast.success('Route added');
      }
      setIsModalOpen(false);
      setEditingRoute(null);
      setFormData({
        routeName: '',
        vehicleName: '',
        salesmanName: '',
        salesmanNumber: '',
        deliveryManName: '',
        deliveryManNumber: '',
        routeDay: ''
      });
      fetchRoutes();
    } catch (error) {
      const msg = handleFirestoreError(error, editingRoute ? OperationType.UPDATE : OperationType.CREATE, 'routes');
      toast.error(msg);
    }
  };

  const handleDelete = async () => {
    if (!routeToDelete) return;
    try {
      await deleteDoc(doc(db, 'routes', routeToDelete));
      toast.success('Route deleted');
      setIsDeleteModalOpen(false);
      setRouteToDelete(null);
      fetchRoutes();
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search routes by name..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Route
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
              <tr>
                <th className="px-6 py-3 font-medium">Route Name</th>
                <th className="px-6 py-3 font-medium">Vehicle</th>
                <th className="px-6 py-3 font-medium">Salesman</th>
                <th className="px-6 py-3 font-medium">Delivery Man</th>
                <th className="px-6 py-3 font-medium">Day</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {routes.map((route) => (
                <tr key={route.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{route.routeName}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{route.vehicleName}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-gray-900 dark:text-white font-medium">{route.salesmanName}</span>
                      <span className="text-xs text-gray-500">{route.salesmanNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-gray-900 dark:text-white font-medium">{route.deliveryManName}</span>
                      <span className="text-xs text-gray-500">{route.deliveryManNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{route.routeDay}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          setEditingRoute(route);
                          setFormData({ 
                            routeName: route.routeName || '',
                            vehicleName: route.vehicleName || '',
                            salesmanName: route.salesmanName || '',
                            salesmanNumber: route.salesmanNumber || '',
                            deliveryManName: route.deliveryManName || '',
                            deliveryManNumber: route.deliveryManNumber || '',
                            routeDay: route.routeDay || ''
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
                          setRouteToDelete(route.id!);
                          setIsDeleteModalOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {routes.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">No routes found</td>
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
          <Card className="relative w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editingRoute ? 'Edit Route' : 'Add New Route'}</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Route Name"
                value={formData.routeName}
                onChange={(e) => setFormData({ ...formData, routeName: e.target.value })}
                required
              />
              <Input
                label="Vehicle Name"
                value={formData.vehicleName}
                onChange={(e) => setFormData({ ...formData, vehicleName: e.target.value })}
                required
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Salesman Name"
                  value={formData.salesmanName}
                  onChange={(e) => setFormData({ ...formData, salesmanName: e.target.value })}
                  required
                />
                <Input
                  label="Salesman Number"
                  value={formData.salesmanNumber}
                  onChange={(e) => setFormData({ ...formData, salesmanNumber: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Delivery Man Name"
                  value={formData.deliveryManName}
                  onChange={(e) => setFormData({ ...formData, deliveryManName: e.target.value })}
                  required
                />
                <Input
                  label="Delivery Man Number"
                  value={formData.deliveryManNumber}
                  onChange={(e) => setFormData({ ...formData, deliveryManNumber: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Route Day</label>
                <select 
                  className="w-full rounded-lg border border-gray-300 p-2 dark:border-gray-600 dark:bg-gray-800"
                  value={formData.routeDay}
                  onChange={(e) => setFormData({ ...formData, routeDay: e.target.value })}
                  required
                >
                  <option value="">Select Day</option>
                  {days.map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="w-full">
                {editingRoute ? 'Update Route' : 'Add Route'}
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
            <p className="text-gray-600 dark:text-gray-400">Are you sure you want to delete this route? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete}>Delete Route</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
