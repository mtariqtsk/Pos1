import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs, where, Timestamp, getCountFromServer } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Card } from '../components/ui';
import { 
  TrendingUp, 
  Users, 
  Package, 
  FileText, 
  ArrowUpRight 
} from 'lucide-react';
import { Invoice, Customer, Item, AppSettings } from '../types';
import { format } from 'date-fns';
import { doc, getDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState({
    totalSales: 0,
    todaySales: 0,
    totalCustomers: 0,
    totalItems: 0
  });
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = Timestamp.fromDate(today);

        // Fetch settings
        const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
        if (settingsSnap.exists()) {
          setAppSettings(settingsSnap.data() as AppSettings);
        }

        // 1. Get counts and today's sales efficiently
        const [customersCount, itemsCount, todayInvoicesSnap, allInvoicesSnap] = await Promise.all([
          getCountFromServer(collection(db, 'customers')),
          getCountFromServer(collection(db, 'items')),
          getDocs(query(collection(db, 'invoices'), where('createdAt', '>=', todayTimestamp))),
          getDocs(collection(db, 'invoices'))
        ]);

        const totalSales = allInvoicesSnap.docs.reduce((acc, doc) => acc + (doc.data() as Invoice).grandTotal, 0);
        const todaySales = todayInvoicesSnap.docs.reduce((acc, doc) => acc + (doc.data() as Invoice).grandTotal, 0);

        setStats({
          totalSales,
          todaySales,
          totalCustomers: customersCount.data().count,
          totalItems: itemsCount.data().count
        });

        // 2. Fetch recent invoices
        const recentQuery = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'), limit(5));
        const recentSnap = await getDocs(recentQuery);
        setRecentInvoices(recentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const currency = appSettings?.currencySymbol || '$';

  const statCards = [
    { name: 'Total Sales', value: `${currency}${stats.totalSales.toLocaleString()}`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
    { name: "Today's Sales", value: `${currency}${stats.todaySales.toLocaleString()}`, icon: ArrowUpRight, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { name: 'Total Customers', value: stats.totalCustomers, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
    { name: 'Total Items', value: stats.totalItems, icon: Package, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20' },
  ];

  if (loading) return <div className="flex h-64 items-center justify-center">Loading dashboard...</div>;

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.name} className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{stat.name}</p>
                <h3 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</h3>
              </div>
              <div className={cn("rounded-lg p-3", stat.bg)}>
                <stat.icon className={cn("h-6 w-6", stat.color)} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Invoices</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3 font-medium">Invoice #</th>
                  <th className="px-6 py-3 font-medium">Customer</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {recentInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4 font-medium text-blue-600 dark:text-blue-400">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="px-6 py-4 text-gray-900 dark:text-white">{invoice.customerName}</td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                      {format(invoice.createdAt.toDate(), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                      {currency}{invoice.grandTotal.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {recentInvoices.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No invoices found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Quick Actions</h3>
          <div className="space-y-3">
            <Link to="/invoices" className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
              <FileText className="h-4 w-4" />
              Manage Invoices
            </Link>
            <Link to="/customers" className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
              <Users className="h-4 w-4" />
              Add Customer
            </Link>
            <Link to="/items" className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
              <Package className="h-4 w-4" />
              Inventory Check
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};
