import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'salesman';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Timestamp;
}

export type CustomerType = 'retail' | 'wholesale' | 'supplier';

export interface Customer {
  id?: string;
  name: string;
  phone: string;
  address: string;
  type: CustomerType;
  balance: number;
  routeId?: string;
  routeName?: string;
  createdAt: Timestamp;
}

export interface Item {
  id?: string;
  name: string;
  category: string;
  purchasePrice: number;
  wholesalePrice: number;
  retailPrice: number;
  stock: number;
  unitsPerCarton: number;
  tax: number;
  createdAt: Timestamp;
}

export interface InvoiceItem {
  itemId: string;
  name: string;
  quantity: number;
  unitsPerCarton: number;
  price: number;
  discount: number;
  tax: number; // Tax percentage
  taxAmount: number; // Calculated tax amount
  total: number;
}

export interface Invoice {
  id?: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  salesmanId: string;
  salesmanName: string;
  items: InvoiceItem[];
  subTotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface PurchaseItem {
  itemId: string;
  name: string;
  quantity: number;
  unitsPerCarton: number;
  price: number;
  total: number;
}

export interface Purchase {
  id?: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseItem[];
  totalAmount: number;
  createdAt: Timestamp;
}

export interface Route {
  id?: string;
  routeName: string;
  vehicleName: string;
  salesmanName: string;
  salesmanNumber: string;
  deliveryManName: string;
  deliveryManNumber: string;
  routeDay: string;
  createdAt: Timestamp;
}

export interface AppSettings {
  id?: string;
  stockValidationOnSales: boolean;
  distributionName: string;
  distributionAddress: string;
  distributionPhone: string;
  currencySymbol: string;
  updatedAt: Timestamp;
}
