import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Chip, List, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { api, ApiError } from '../api/client';
import type { Customer, Route } from '../api/types';
import { colors, shape, space, tapMin } from '../theme/tokens';
import { suggestRoute } from '../orders/orderStatus';
import { takePhotoAsBase64 } from '../orders/pickPhoto';
import { track } from '../analytics/track';
import { useAuth } from '../auth/AuthContext';

// AC-19 (S21) — "Dùng lại số đo này cho đơn mới": chép SANG đơn mới, không sửa bản cũ
// (ARCHITECTURE.md §6). CreateOrderDto nhận thẳng field số đo tuỳ chọn (DECISIONS.md vòng 7).
export interface CreateOrderPrefill {
  customer: Customer;
  measurements?: {
    length: number | null;
    depth: number | null;
    width: number | null;
    thickness: number | null;
    photo: string | null;
  };
}

// S18 "Ghi đơn mới" (CAP-DEM-01, AC-18) — nhập trong ~30 giây lúc khách gọi (`_PROPOSAL.md`
// "Rủi ro phải xử"): SĐT trước (nhận ra khách cũ) → bộ ghế → buôn/lẻ → khu vực gợi ý →
// "Thêm chi tiết" (C20) gấp lại phần ít dùng ngay lúc mới vào.
export function CreateOrderScreen({ onDone, prefill }: { onDone: () => void; prefill?: CreateOrderPrefill }) {
  const { user } = useAuth();
  const [phone, setPhone] = useState(prefill?.customer.phone ?? '');
  const [matches, setMatches] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(prefill?.customer ?? null);
  const [name, setName] = useState(prefill?.customer.name ?? '');
  const [address, setAddress] = useState(prefill?.customer.address ?? '');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'le' | 'buon'>('le');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [routeTouched, setRouteTouched] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hasEmbroidery, setHasEmbroidery] = useState(false);
  const [difficulty, setDifficulty] = useState<'de' | 'kho'>('de');
  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get<Route[]>('/routes').then(setRoutes).catch(() => {});
  }, []);

  // Gợi ý khu vực khi có đủ địa chỉ + danh sách khu vực — chỉ tự gợi ý nếu chủ xưởng
  // CHƯA tự tay chọn (routeTouched), đúng "app gợi ý, chủ xưởng xác nhận hoặc chạm khác"
  // (DECISIONS.md vòng 7 — tính ở client).
  useEffect(() => {
    if (routeTouched || !address.trim() || routes.length === 0) return;
    const s = suggestRoute(address, routes, selectedCustomer?.areaId);
    setRouteId(s.routeId);
  }, [address, routes, selectedCustomer, routeTouched]);

  // Debounce tìm khách theo SĐT — S18 "SĐT (nhận ra khách cũ...)".
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (phone.trim().length < 3 || selectedCustomer) {
      setMatches([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      api
        .get<Customer[]>(`/customers/search?q=${encodeURIComponent(phone.trim())}`)
        .then(setMatches)
        .catch(() => {});
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [phone, selectedCustomer]);

  function pickCustomer(c: Customer) {
    setSelectedCustomer(c);
    setPhone(c.phone);
    setName(c.name);
    setAddress(c.address);
    setMatches([]);
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setName('');
    setAddress('');
  }

  const dueDays = mode === 'buon' ? 2 : 7;
  const canSubmit =
    phone.trim() && (selectedCustomer || (name.trim() && address.trim())) && description.trim() && !sending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    try {
      const order = await api.post<{ id: string }>('/orders', {
        customerId: selectedCustomer?.id,
        customer: selectedCustomer
          ? undefined
          : { name: name.trim(), phone: phone.trim(), address: address.trim(), areaId: routeId ?? undefined },
        mode,
        description: description.trim(),
        difficulty,
        hasEmbroidery,
        routeId: routeId ?? undefined,
        deliveryMethod: routeId ? 'route' : 'xe_om',
        price: price.trim() ? Number(price) : undefined,
        deposit: deposit.trim() ? Number(deposit) : undefined,
        photos: photo ? [photo] : undefined,
        measurementLength: prefill?.measurements?.length ?? undefined,
        measurementDepth: prefill?.measurements?.depth ?? undefined,
        measurementWidth: prefill?.measurements?.width ?? undefined,
        measurementThickness: prefill?.measurements?.thickness ?? undefined,
        measurementPhoto: prefill?.measurements?.photo ?? undefined,
      });
      if (user) track('ghi_don_dem', user.id, { orderId: order.id });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Mất kết nối — thử lại.');
    } finally {
      setSending(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      {error && (
        <Banner visible icon="alert-circle" style={styles.banner} actions={[{ label: 'Thử lại', onPress: handleSubmit }]}>
          {error}
        </Banner>
      )}
      <Text variant="titleLarge" style={styles.title}>
        Ghi đơn mới
      </Text>

      <TextInput
        label="Số điện thoại khách"
        mode="outlined"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          if (selectedCustomer) clearCustomer();
        }}
        style={styles.input}
      />
      {matches.length > 0 && (
        <View style={styles.matchList}>
          {matches.map((c) => (
            <List.Item key={c.id} title={c.name} description={`${c.phone} · ${c.address}`} onPress={() => pickCustomer(c)} />
          ))}
        </View>
      )}
      {selectedCustomer && (
        <Banner visible icon="account-check" style={styles.foundBanner}>
          Khách cũ: {selectedCustomer.name} — {selectedCustomer.orders.length} đơn trước đây
        </Banner>
      )}
      {!selectedCustomer && (
        <>
          <TextInput label="Tên khách" mode="outlined" value={name} onChangeText={setName} style={styles.input} />
          <TextInput label="Địa chỉ" mode="outlined" value={address} onChangeText={setAddress} style={styles.input} />
        </>
      )}

      <TextInput
        label="Bộ ghế"
        mode="outlined"
        placeholder="Vd. bộ salon 4 món gỗ hương"
        value={description}
        onChangeText={setDescription}
        multiline
        style={styles.input}
      />

      <Text variant="bodyLarge" style={styles.label}>
        Chế độ
      </Text>
      <SegmentedButtons
        value={mode}
        onValueChange={(v) => setMode(v as 'le' | 'buon')}
        buttons={[
          { value: 'le', label: 'Khách lẻ' },
          { value: 'buon', label: 'Khách buôn' },
        ]}
        style={styles.input}
      />
      <Text variant="bodySmall" style={styles.hint}>
        Hẹn trả mặc định {dueDays} ngày — sửa được ở chi tiết đơn.
      </Text>

      <Text variant="bodyLarge" style={styles.label}>
        Khu vực trả hàng
      </Text>
      <View style={styles.chipRow}>
        {[{ id: null, name: 'Xe ôm chuyến lẻ' }, ...routes.filter((r) => r.active)].map((r) => (
          <Chip
            key={r.id ?? 'xe_om'}
            selected={routeId === r.id}
            onPress={() => {
              setRouteId(r.id);
              setRouteTouched(true);
            }}
            style={styles.chip}
          >
            {r.name}
          </Chip>
        ))}
      </View>

      <List.Accordion
        title="Thêm chi tiết"
        expanded={expanded}
        onPress={() => setExpanded((v) => !v)}
        style={styles.accordion}
      >
        <View style={styles.accordionBody}>
          <Chip selected={hasEmbroidery} onPress={() => setHasEmbroidery((v) => !v)} style={styles.chip}>
            Có thêu
          </Chip>
          <Chip selected={difficulty === 'kho'} onPress={() => setDifficulty((d) => (d === 'kho' ? 'de' : 'kho'))} style={styles.chip}>
            Bộ khó (uốn lượn nhiều)
          </Chip>
          <TextInput label="Giá (đ)" mode="outlined" keyboardType="numeric" value={price} onChangeText={setPrice} style={styles.input} />
          <TextInput label="Đã cọc (đ)" mode="outlined" keyboardType="numeric" value={deposit} onChangeText={setDeposit} style={styles.input} />
          <Button
            mode={photo ? 'outlined' : 'text'}
            onPress={async () => setPhoto(await takePhotoAsBase64())}
            contentStyle={{ height: tapMin }}
          >
            {photo ? 'Đã chụp ảnh bộ ghế — chụp lại' : 'Chụp ảnh bộ ghế'}
          </Button>
        </View>
      </List.Accordion>

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={sending}
        disabled={!canSubmit}
        style={styles.button}
        contentStyle={{ height: tapMin }}
      >
        {sending ? 'Đang gửi…' : 'Ghi đơn'}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  foundBanner: { marginBottom: space.md, backgroundColor: colors.tertiaryContainer },
  title: { marginBottom: space.md },
  input: { marginBottom: space.md },
  matchList: { marginBottom: space.sm, backgroundColor: colors.surfaceContainer, borderRadius: shape.small },
  label: { marginBottom: space.sm },
  hint: { color: colors.onSurfaceVariant, marginTop: -space.sm, marginBottom: space.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  chip: { marginBottom: space.xs },
  accordion: { backgroundColor: colors.surfaceContainer, borderRadius: shape.small, marginBottom: space.md, paddingHorizontal: 0 },
  accordionBody: { padding: space.md, gap: space.sm },
  button: { borderRadius: shape.small },
});
