import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface FriendPassConfig {
  id: string;
  config_name: string;
  base_price_eth: string;
  slope_eth: string;
  max_supply_per_runner: number;
  max_per_wallet: number;
  reputation_enabled: boolean;
  reputation_multiplier: string;
  reputation_base_threshold: number;
  tax_sitewallet_bps: number;
  tax_profile_owner_bps: number;
  tax_dao_bps: number;
  tax_ancient_bps: number;
  volatile_price_percentage: number;
  reputation_price_percentage: number;
  sell_enabled: boolean;
  sell_fee_bps: number;
  min_sell_price_eth: string;
  chain_id: number;
  contract_address: string | null;
  description: string | null;
  is_active: boolean;
}

interface SimulationResult {
  simulation_name: string;
  config_params: any;
  runner_reputation: number;
  supply_sold: number;
  results: {
    total_revenue_eth: string;
    purchases: any[];
  };
}

export default function FriendPassPage() {
  const [configs, setConfigs] = useState<FriendPassConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<FriendPassConfig | null>(null);
  const [simulationResults, setSimulationResults] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    config_name: 'default',
    base_price_eth: 0.001,
    slope_eth: 0.0001,
    max_supply_per_runner: 100,
    max_per_wallet: 5,
    reputation_enabled: true,
    reputation_multiplier: 1.0,
    reputation_base_threshold: 100,
    tax_sitewallet_bps: 3000,
    tax_profile_owner_bps: 4000,
    tax_dao_bps: 2000,
    tax_ancient_bps: 1000,
    volatile_price_percentage: 60,
    reputation_price_percentage: 40,
    sell_enabled: true,
    sell_fee_bps: 500,
    min_sell_price_eth: 0.0005,
    chain_id: 137,
    description: '',
  });

  const [simulationParams, setSimulationParams] = useState({
    runner_reputation: 0,
    supply_sold: 0,
    simulation_name: 'Test Simulation',
  });

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const response = await fetch('/api/admin/friendpass/config');
      const data = await response.json();
      setConfigs(data);
      const defaultConfig = data.find((c: FriendPassConfig) => c.config_name === 'default');
      if (defaultConfig) {
        setSelectedConfig(defaultConfig);
        setFormData({
          config_name: defaultConfig.config_name,
          base_price_eth: parseFloat(defaultConfig.base_price_eth),
          slope_eth: parseFloat(defaultConfig.slope_eth),
          max_supply_per_runner: defaultConfig.max_supply_per_runner,
          max_per_wallet: defaultConfig.max_per_wallet,
          reputation_enabled: defaultConfig.reputation_enabled,
          reputation_multiplier: parseFloat(defaultConfig.reputation_multiplier),
          reputation_base_threshold: defaultConfig.reputation_base_threshold,
          tax_sitewallet_bps: defaultConfig.tax_sitewallet_bps,
          tax_profile_owner_bps: defaultConfig.tax_profile_owner_bps,
          tax_dao_bps: defaultConfig.tax_dao_bps,
          tax_ancient_bps: defaultConfig.tax_ancient_bps,
          volatile_price_percentage: defaultConfig.volatile_price_percentage,
          reputation_price_percentage: defaultConfig.reputation_price_percentage,
          sell_enabled: defaultConfig.sell_enabled,
          sell_fee_bps: defaultConfig.sell_fee_bps,
          min_sell_price_eth: parseFloat(defaultConfig.min_sell_price_eth),
          chain_id: defaultConfig.chain_id,
          description: defaultConfig.description || '',
        });
      }
    } catch (error) {
      console.error('Failed to fetch configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      const response = await fetch('/api/admin/friendpass/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        await fetchConfigs();
      }
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  };

  const handleRunSimulation = async () => {
    setSimulating(true);
    try {
      const response = await fetch('/api/admin/friendpass/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_name: formData.config_name,
          config_params: formData,
          ...simulationParams,
        }),
      });
      const data = await response.json();
      setSimulationResults(data);
    } catch (error) {
      console.error('Failed to run simulation:', error);
    } finally {
      setSimulating(false);
    }
  };

  const calculateTaxTotal = () => {
    return formData.tax_sitewallet_bps + formData.tax_profile_owner_bps + formData.tax_dao_bps + formData.tax_ancient_bps;
  };

  const calculatePriceSplitTotal = () => {
    return formData.volatile_price_percentage + formData.reputation_price_percentage;
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">FriendPass Configuration</h1>
        <p className="text-muted-foreground">
          Configure FriendPass pricing, tax structure, and reputation-based adjustments
        </p>
      </div>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="simulation">Simulation</TabsTrigger>
          <TabsTrigger value="wallets">Profile Wallets</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pricing Parameters</CardTitle>
              <CardDescription>Configure base pricing and supply limits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Base Price (ETH)</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={formData.base_price_eth}
                    onChange={(e) => setFormData({ ...formData, base_price_eth: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slope (ETH)</Label>
                  <Input
                    type="number"
                    step="0.00001"
                    value={formData.slope_eth}
                    onChange={(e) => setFormData({ ...formData, slope_eth: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Supply per Runner</Label>
                  <Input
                    type="number"
                    value={formData.max_supply_per_runner}
                    onChange={(e) => setFormData({ ...formData, max_supply_per_runner: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max per Wallet</Label>
                  <Input
                    type="number"
                    value={formData.max_per_wallet}
                    onChange={(e) => setFormData({ ...formData, max_per_wallet: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reputation-Based Pricing</CardTitle>
              <CardDescription>Configure how reputation affects pricing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="reputation-enabled">Enable Reputation Pricing</Label>
                <Switch
                  id="reputation-enabled"
                  checked={formData.reputation_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, reputation_enabled: checked })}
                />
              </div>
              {formData.reputation_enabled && (
                <div className="grid grid-cols-2 gap-4 space-y-2">
                  <div className="space-y-2">
                    <Label>Reputation Multiplier</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.reputation_multiplier}
                      onChange={(e) => setFormData({ ...formData, reputation_multiplier: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Base Threshold</Label>
                    <Input
                      type="number"
                      value={formData.reputation_base_threshold}
                      onChange={(e) => setFormData({ ...formData, reputation_base_threshold: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tax Structure</CardTitle>
              <CardDescription>
                Configure revenue distribution (Total must be 10000 basis points = 100%)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Site Wallet (%)</Label>
                    <Badge variant={calculateTaxTotal() === 10000 ? 'default' : 'destructive'}>
                      {(formData.tax_sitewallet_bps / 100).toFixed(1)}%
                    </Badge>
                  </div>
                  <Slider
                    value={[formData.tax_sitewallet_bps]}
                    onValueChange={([value]) => setFormData({ ...formData, tax_sitewallet_bps: value })}
                    max={5000}
                    step={100}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Profile Owner (%)</Label>
                    <Badge variant={calculateTaxTotal() === 10000 ? 'default' : 'destructive'}>
                      {(formData.tax_profile_owner_bps / 100).toFixed(1)}%
                    </Badge>
                  </div>
                  <Slider
                    value={[formData.tax_profile_owner_bps]}
                    onValueChange={([value]) => setFormData({ ...formData, tax_profile_owner_bps: value })}
                    max={5000}
                    step={100}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>DAO (%)</Label>
                    <Badge variant={calculateTaxTotal() === 10000 ? 'default' : 'destructive'}>
                      {(formData.tax_dao_bps / 100).toFixed(1)}%
                    </Badge>
                  </div>
                  <Slider
                    value={[formData.tax_dao_bps]}
                    onValueChange={([value]) => setFormData({ ...formData, tax_dao_bps: value })}
                    max={3000}
                    step={100}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Ancient Owner (%)</Label>
                    <Badge variant={calculateTaxTotal() === 10000 ? 'default' : 'destructive'}>
                      {(formData.tax_ancient_bps / 100).toFixed(1)}%
                    </Badge>
                  </div>
                  <Slider
                    value={[formData.tax_ancient_bps]}
                    onValueChange={([value]) => setFormData({ ...formData, tax_ancient_bps: value })}
                    max={2000}
                    step={100}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">Total:</span>
                  <Badge variant={calculateTaxTotal() === 10000 ? 'default' : 'destructive'}>
                    {(calculateTaxTotal() / 100).toFixed(1)}%
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Price Split (Volatile vs Reputation)</CardTitle>
              <CardDescription>
                Configure how price is split between market-based and reputation-based (Total must be 100%)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Volatile (Market-based) (%)</Label>
                    <Badge variant={calculatePriceSplitTotal() === 100 ? 'default' : 'destructive'}>
                      {formData.volatile_price_percentage}%
                    </Badge>
                  </div>
                  <Slider
                    value={[formData.volatile_price_percentage]}
                    onValueChange={([value]) => setFormData({ ...formData, volatile_price_percentage: value })}
                    max={100}
                    step={5}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Reputation-based (%)</Label>
                    <Badge variant={calculatePriceSplitTotal() === 100 ? 'default' : 'destructive'}>
                      {formData.reputation_price_percentage}%
                    </Badge>
                  </div>
                  <Slider
                    value={[formData.reputation_price_percentage]}
                    onValueChange={([value]) => setFormData({ ...formData, reputation_price_percentage: value })}
                    max={100}
                    step={5}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">Total:</span>
                  <Badge variant={calculatePriceSplitTotal() === 100 ? 'default' : 'destructive'}>
                    {calculatePriceSplitTotal()}%
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Selling Configuration</CardTitle>
              <CardDescription>Configure FriendPass selling mechanism</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="sell-enabled">Enable Selling</Label>
                <Switch
                  id="sell-enabled"
                  checked={formData.sell_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, sell_enabled: checked })}
                />
              </div>
              {formData.sell_enabled && (
                <div className="grid grid-cols-2 gap-4 space-y-2">
                  <div className="space-y-2">
                    <Label>Sell Fee (%)</Label>
                    <Input
                      type="number"
                      value={formData.sell_fee_bps / 100}
                      onChange={(e) => setFormData({ ...formData, sell_fee_bps: parseFloat(e.target.value) * 100 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Min Sell Price (ETH)</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={formData.min_sell_price_eth}
                      onChange={(e) => setFormData({ ...formData, min_sell_price_eth: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSaveConfig} size="lg">
              Save Configuration
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="simulation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Price Simulation</CardTitle>
              <CardDescription>Simulate FriendPass pricing with different parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Runner Reputation</Label>
                  <Input
                    type="number"
                    value={simulationParams.runner_reputation}
                    onChange={(e) => setSimulationParams({ ...simulationParams, runner_reputation: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Supply Sold</Label>
                  <Input
                    type="number"
                    value={simulationParams.supply_sold}
                    onChange={(e) => setSimulationParams({ ...simulationParams, supply_sold: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <Button onClick={handleRunSimulation} disabled={simulating}>
                {simulating ? 'Simulating...' : 'Run Simulation'}
              </Button>

              {simulationResults && (
                <div className="space-y-4 mt-4">
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2">Simulation Results</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Total Revenue (ETH):</span>
                        <span className="font-mono">{simulationResults.results.total_revenue_eth}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Purchases Simulated:</span>
                        <span className="font-mono">{simulationResults.results.purchases.length}</span>
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2">Purchase Breakdown</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Supply</TableHead>
                          <TableHead>Price (ETH)</TableHead>
                          <TableHead>Volatile</TableHead>
                          <TableHead>Reputation</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {simulationResults.results.purchases.map((purchase: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell>{purchase.purchase_number}</TableCell>
                            <TableCell>{purchase.supply}</TableCell>
                            <TableCell className="font-mono">{purchase.price_eth}</TableCell>
                            <TableCell className="font-mono">{purchase.volatile_portion}</TableCell>
                            <TableCell className="font-mono">{purchase.reputation_portion}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Wallets</CardTitle>
              <CardDescription>Manage user profile wallets on Polygon</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Profile wallet management interface will be implemented here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
