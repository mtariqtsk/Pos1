import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, where, Timestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Invoice, AppSettings } from '../types';
import { Card, Button } from '../components/ui';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { Download } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    const fetchInvoices = async () => {
      const start = startOfMonth(new Date());
      const q = query(
        collection(db, 'invoices'), 
        where('createdAt', '>=', Timestamp.fromDate(start)),
        orderBy('createdAt', 'asc')
      );
      const snap = await getDocs(q);
      setInvoices(snap.docs.map(doc => doc.data() as Invoice));
      setLoading(false);
    };
    fetchInvoices();
  }, []);

  const currencySymbol = appSettings?.currencySymbol || '$';

  const salesByDay = () => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    const days = eachDayOfInterval({ start, end });

    return days.map(day => {
      const daySales = invoices
        .filter(inv => isSameDay(inv.createdAt.toDate(), day))
        .reduce((acc, inv) => acc + inv.grandTotal, 0);
      return {
        date: format(day, 'dd'),
        sales: daySales
      };
    });
  };

  const topItems = () => {
    const itemSales: Record<string, number> = {};
    invoices.forEach(inv => {
      inv.items.forEach(item => {
        itemSales[item.name] = (itemSales[item.name] || 0) + item.quantity;
      });
    });
    return Object.entries(itemSales)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  };

  const exportToCSV = () => {
    const headers = ['Invoice #', 'Customer', 'Date', `Amount (${currencySymbol})` ];
    const rows = invoices.map(inv => [
      inv.invoiceNumber,
      inv.customerName,
      format(inv.createdAt.toDate(), 'yyyy-MM-dd'),
      inv.grandTotal
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sales_report_${format(new Date(), 'yyyy_MM')}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  if (loading) return <div>Loading reports...</div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Button onClick={exportToCSV} className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="mb-6 text-lg font-semibold">Sales This Month</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesByDay()}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis tickFormatter={(value) => `${currencySymbol}${value}`} />
                <Tooltip formatter={(value: number) => [`${currencySymbol}${value.toLocaleString()}`, 'Sales']} />
                <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="mb-6 text-lg font-semibold">Top Selling Items</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topItems()}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="qty" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};
