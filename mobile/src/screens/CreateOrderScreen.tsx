import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Chip, List, Text, TextInput } from 'react-native-paper';
import * as SecureStore from 'expo-secure-store';
import { api, ApiError } from '../api/client';
import type { Customer, Route } from '../api/types';
import { colors, shape, space, tapMin } from '../theme/tokens';
import { suggestRoute } from '../orders/orderStatus';
import { PhotoBox } from '../orders/PhotoBox';
import { takePhotoAsBase64 } from '../orders/pickPhoto';
import { track } from '../analytics/track';
import { useAuth } from '../auth/AuthContext';
import { KeyboardAvoider } from '../common/KeyboardAvoider';

// AC-25 (vòng 8, CAP-BUG-02) — cùng khuôn nháp đã có ở CreateTaskScreen từ vòng 2 (S3),
// S18 "Ghi đơn mới" trước đây CHƯA có gì tương tự — khách gọi lúc chủ xưởng đang gõ dở
// (điện thoại rung, app bị hệ điều hành force-stop) làm mất trắng y hệt bug đã vá ở S3.
const DRAFT_KEY = 'workshop-app.create-order-draft';

interface OrderDraft {
  phone: string;
  name: string;
  address: string;
  description: string;
  mode: 'le' | 'buon';
  routeId: string | null;
  routeTouched: boolean;
  hasEmbroidery: boolean;
  difficulty: 'de' | 'kho';
  price: string;
  deposit: string;
  photo: string | null;
}

async function loadOrderDraft(): Promise<OrderDraft | null> {
  const raw = Platform.OS === 'web' ? localStorage.getItem(DRAFT_KEY) : await SecureStore.getItemAsync(DRAFT_KEY);
  return raw ? (JSON.parse(raw) as OrderDraft) : null;
}

async function saveOrderDraft(draft: OrderDraft) {
  const raw = JSON.stringify(draft);
  if (Platform.OS === 'web') {
    localStorage.setItem(DRAFT_KEY, raw);
    return;
  }
  await SecureStore.setItemAsync(DRAFT_KEY, raw);
}

async function clearOrderDraft() {
  if (Platform.OS === 'web') {
    localStorage.removeItem(DRAFT_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(DRAFT_KEY);
}

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
  const [banner, setBanner] = useState<string | null>(null);
  // dogfood pha I vòng 7: sau khi "Ghi đơn" thành công, `onDone()` điều
  // hướng đi (`navigation.navigate`, không `replace`) nên màn này vẫn còn trong ngăn xếp —
  // bấm Back (phần cứng) quay LẠI đúng form cũ còn banner xanh cũ + nút "Ghi đơn" còn bật,
  // dễ khiến người bấm vội tưởng chưa gửi và bấm lại, tạo đơn trùng. Khoá hẳn form sau khi
  // gửi thành công, không đợi điều hướng.
  const [submitted, setSubmitted] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // có prefill (AC-19, "dùng lại số đo") thì bỏ qua nháp cũ — ý định mới nhất thắng,
  // đúng khuôn `draftLoaded` của CreateTaskScreen.
  const draftLoaded = useRef(!!prefill);
  const [hasOldDraft, setHasOldDraft] = useState(false);

  useEffect(() => {
    api.get<Route[]>('/routes').then(setRoutes).catch(() => {});
  }, []);

  // Khôi phục nháp CHỈ khi vào màn không kèm prefill.
  useEffect(() => {
    if (draftLoaded.current) return;
    loadOrderDraft().then((draft) => {
      if (draft) {
        setPhone(draft.phone);
        setName(draft.name);
        setAddress(draft.address);
        setDescription(draft.description);
        setMode(draft.mode);
        setRouteId(draft.routeId);
        setRouteTouched(draft.routeTouched);
        setHasEmbroidery(draft.hasEmbroidery);
        setDifficulty(draft.difficulty);
        setPrice(draft.price);
        setDeposit(draft.deposit);
        setPhoto(draft.photo);
        setHasOldDraft(true);
      }
      draftLoaded.current = true;
    });
  }, []);

  // Lưu nháp mỗi khi đổi field — chỉ sau khi đã khôi phục xong (tránh ghi đè bằng state
  // rỗng lúc mới mount), và chỉ khi còn nội dung thật (không phải toàn field trống/mặc định).
  useEffect(() => {
    if (!draftLoaded.current) return;
    const empty =
      !phone.trim() && !name.trim() && !address.trim() && !description.trim() && !price.trim() && !deposit.trim() && !photo;
    if (empty) {
      clearOrderDraft();
      return;
    }
    saveOrderDraft({ phone, name, address, description, mode, routeId, routeTouched, hasEmbroidery, difficulty, price, deposit, photo });
  }, [phone, name, address, description, mode, routeId, routeTouched, hasEmbroidery, difficulty, price, deposit, photo]);

  function discardDraft() {
    clearOrderDraft();
    setPhone('');
    setName('');
    setAddress('');
    setDescription('');
    setMode('le');
    setRouteId(null);
    setRouteTouched(false);
    setHasEmbroidery(false);
    setDifficulty('de');
    setPrice('');
    setDeposit('');
    setPhoto(null);
    setSelectedCustomer(null);
    setHasOldDraft(false);
  }

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
    phone.trim() && (selectedCustomer || (name.trim() && address.trim())) && description.trim() && !sending && !submitted;

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
      // §4b luật 3 "làm xong phải nói là đã xong" — dogfood pha I vòng 7 (meta): trước đây
      // quay thẳng về S17 không có xác nhận nào, giống lỗi CreateTaskScreen đã sửa từ vòng 2.
      setBanner('Đã ghi đơn. Đơn mới hiện ở đầu danh sách.');
      setSubmitted(true);
      clearOrderDraft();
      setHasOldDraft(false);
      setTimeout(onDone, 1200);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Mất kết nối — thử lại.');
    } finally {
      setSending(false);
    }
  }

  // dogfood pha I vòng 7 (cùng phát hiện ở CustomerLookupScreen) — xem giải thích ở đó.
  return (
    <KeyboardAvoider>
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }} keyboardShouldPersistTaps="handled">
      {hasOldDraft && (
        <Banner
          visible
          icon="pencil"
          style={styles.draftBanner}
          actions={[{ label: 'Xoá', onPress: discardDraft }]}
        >
          Đang tiếp tục nháp trước đó — Xoá để bắt đầu mới
        </Banner>
      )}
      {banner && (
        <Banner visible icon="check-circle" style={styles.successBanner}>
          {banner}
        </Banner>
      )}
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
      {/* dogfood pha I vòng 7: SegmentedButtons của react-native-paper
          không có chỗ chỉnh chiều cao — đo được 38dp, dưới --tap-min 48px (§2.3). Thay bằng
          hai Button thường cùng khuôn contentStyle={{height: tapMin}} đã dùng toàn app. */}
      <View style={styles.modeRow}>
        <Button
          mode={mode === 'le' ? 'contained' : 'outlined'}
          onPress={() => setMode('le')}
          style={styles.modeButton}
          contentStyle={{ height: tapMin }}
        >
          Khách lẻ
        </Button>
        <Button
          mode={mode === 'buon' ? 'contained' : 'outlined'}
          onPress={() => setMode('buon')}
          style={styles.modeButton}
          contentStyle={{ height: tapMin }}
        >
          Khách buôn
        </Button>
      </View>
      <Text variant="bodySmall" style={styles.hint}>
        Hẹn trả mặc định {dueDays} ngày — sửa được ở chi tiết đơn.
      </Text>

      <Text variant="bodyLarge" style={styles.label}>
        Khu vực trả hàng
      </Text>
      <View style={styles.chipRow}>
        {[{ id: null, name: 'Xe ôm chuyến lẻ' }, ...routes.filter((r) => r.active)].map((r) => {
          const selected = routeId === r.id;
          return (
            <Chip
              key={r.id ?? 'xe_om'}
              selected={selected}
              onPress={() => {
                setRouteId(r.id);
                setRouteTouched(true);
              }}
              // dogfood pha I vòng 7: mặc định react-native-paper tô chip
              // "selected" bằng secondaryContainer (amber, trùng C17 nhãn BUÔN) và chip
              // thường/chọn gần như không phân biệt được — C18 đòi bật = primary-container,
              // tắt = chỉ viền outline-variant. Ép màu tường minh thay vì tin theme mặc định.
              style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
              textStyle={selected ? styles.chipTextSelected : undefined}
            >
              {r.name}
            </Chip>
          );
        })}
      </View>

      <List.Accordion
        title="Thêm chi tiết"
        expanded={expanded}
        onPress={() => setExpanded((v) => !v)}
        style={styles.accordion}
      >
        <View style={styles.accordionBody}>
          <Chip
            selected={hasEmbroidery}
            onPress={() => setHasEmbroidery((v) => !v)}
            style={[styles.chip, hasEmbroidery ? styles.chipSelected : styles.chipUnselected]}
            textStyle={hasEmbroidery ? styles.chipTextSelected : undefined}
          >
            Có thêu
          </Chip>
          <Chip
            selected={difficulty === 'kho'}
            onPress={() => setDifficulty((d) => (d === 'kho' ? 'de' : 'kho'))}
            style={[styles.chip, difficulty === 'kho' ? styles.chipSelected : styles.chipUnselected]}
            textStyle={difficulty === 'kho' ? styles.chipTextSelected : undefined}
          >
            Bộ khó (uốn lượn nhiều)
          </Chip>
          <TextInput label="Giá (đ)" mode="outlined" keyboardType="numeric" value={price} onChangeText={setPrice} style={styles.input} />
          <TextInput label="Đã cọc (đ)" mode="outlined" keyboardType="numeric" value={deposit} onChangeText={setDeposit} style={styles.input} />
          <PhotoBox photo={photo} label="Chụp ảnh bộ ghế" onPress={async () => setPhoto(await takePhotoAsBase64())} />
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
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  draftBanner: { marginBottom: space.md, backgroundColor: colors.surfaceContainerHigh },
  successBanner: { marginBottom: space.md, backgroundColor: colors.tertiaryContainer },
  foundBanner: { marginBottom: space.md, backgroundColor: colors.tertiaryContainer },
  title: { marginBottom: space.md },
  input: { marginBottom: space.md },
  matchList: { marginBottom: space.sm, backgroundColor: colors.surfaceContainer, borderRadius: shape.small },
  label: { marginBottom: space.sm },
  hint: { color: colors.onSurfaceVariant, marginTop: -space.sm, marginBottom: space.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  // C18 (DESIGN-SYSTEM.md §4): bật = nền --color-primary-container, tắt = chỉ viền
  // --color-outline-variant; cao ≥ --tap-min (48px — sửa AC-34 vòng 8, trước ghi nhầm 40px:
  // chip là hành động bấm được, §2.3 "mọi thứ bấm được" áp cả chip lọc/chọn).
  chip: { marginBottom: space.xs, minHeight: tapMin, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.primaryContainer, borderWidth: 0 },
  chipUnselected: { backgroundColor: 'transparent', borderColor: colors.outlineVariant, borderWidth: 1 },
  chipTextSelected: { color: colors.onPrimaryContainer },
  modeRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  modeButton: { flex: 1, borderRadius: shape.small },
  accordion: { backgroundColor: colors.surfaceContainer, borderRadius: shape.small, marginBottom: space.md, paddingHorizontal: 0 },
  accordionBody: { padding: space.md, gap: space.sm },
  button: { borderRadius: shape.small },
});
