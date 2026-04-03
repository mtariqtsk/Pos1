import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { AppSettings } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Card, Button, Input } from '../components/ui';
import { Settings as SettingsIcon, Save, ShieldAlert, Building2, Globe } from 'lucide-react';
import toast from 'react-hot-toast';

export const SettingsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
        if (settingsDoc.exists()) {
          setSettings(settingsDoc.data() as AppSettings);
        } else {
          // Default settings
          const defaultSettings: AppSettings = {
            stockValidationOnSales: true,
            distributionName: 'My Distribution',
            distributionAddress: '123 Street, City',
            distributionPhone: '0000-0000000',
            currencySymbol: '$',
            updatedAt: Timestamp.now(),
          };
          setSettings(defaultSettings);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!settings || !isAdmin) return;
    setSaving(true);
    try {
      const updatedSettings = {
        ...settings,
        updatedAt: Timestamp.now(),
      };
      await setDoc(doc(db, 'settings', 'global'), updatedSettings);
      setSettings(updatedSettings);
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <SettingsIcon className="w-8 h-8 text-blue-600" />
          Settings
        </h1>
        {isAdmin && (
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        )}
      </div>

      {!isAdmin && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-700">
            Only administrators can modify application settings. You can view the current configuration below.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Distribution Information
          </h2>
          <div className="space-y-4">
            <Input
              label="Distribution Name"
              value={settings?.distributionName || ''}
              onChange={(e) => isAdmin && setSettings(prev => prev ? { ...prev, distributionName: e.target.value } : null)}
              disabled={!isAdmin}
              placeholder="e.g. ABC Distribution"
            />
            <Input
              label="Address"
              value={settings?.distributionAddress || ''}
              onChange={(e) => isAdmin && setSettings(prev => prev ? { ...prev, distributionAddress: e.target.value } : null)}
              disabled={!isAdmin}
              placeholder="e.g. 123 Main St, City"
            />
            <Input
              label="Phone Number"
              value={settings?.distributionPhone || ''}
              onChange={(e) => isAdmin && setSettings(prev => prev ? { ...prev, distributionPhone: e.target.value } : null)}
              disabled={!isAdmin}
              placeholder="e.g. 0300-1234567"
            />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600" />
            Regional Settings
          </h2>
          <div className="space-y-4">
            <Input
              label="Currency Symbol"
              value={settings?.currencySymbol || ''}
              onChange={(e) => isAdmin && setSettings(prev => prev ? { ...prev, currencySymbol: e.target.value } : null)}
              disabled={!isAdmin}
              placeholder="e.g. $, Rs, £"
            />
            
            <div className="pt-4 border-t">
              <h3 className="font-medium text-gray-900 mb-2">Inventory Validation</h3>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Stock Validation on Sales</p>
                  <p className="text-sm text-gray-500">If enabled, sales can only be created when sufficient stock is available.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings?.stockValidationOnSales || false}
                    onChange={(e) => isAdmin && setSettings(prev => prev ? { ...prev, stockValidationOnSales: e.target.checked } : null)}
                    disabled={!isAdmin}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
