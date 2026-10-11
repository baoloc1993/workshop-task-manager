import { useEffect, useRef, useState } from 'react';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HeaderBackButton } from './HeaderBackButton';
import { thinHeader } from './screenOptions';
import { ScreenHeader } from '../common/ScreenHeader';
import { View } from 'react-native';
import { AssignBatWorkersScreen } from '../screens/AssignBatWorkersScreen';
import { AssignGroupsScreen } from '../screens/AssignGroupsScreen';
import { BatQueueScreen } from '../screens/BatQueueScreen';
import { CreateOrderScreen, type CreateOrderPrefill } from '../screens/CreateOrderScreen';
import { CreateTaskScreen, type CreateTaskPrefill } from '../screens/CreateTaskScreen';
import { CustomerLookupScreen } from '../screens/CustomerLookupScreen';
import { CutDoneScreen } from '../screens/CutDoneScreen';
import { DeliveryScreen } from '../screens/DeliveryScreen';
import { DevicesScreen } from '../screens/DevicesScreen';
import { FeedbackScreen } from '../screens/FeedbackScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { IssueQrScreen } from '../screens/IssueQrScreen';
import { OrderDetailScreen } from '../screens/OrderDetailScreen';
import { OrderListScreen } from '../screens/OrderListScreen';
import { OwnerHomeScreen, type LineFilter } from '../screens/OwnerHomeScreen';
import { OwnerMenuScreen } from '../screens/OwnerMenuScreen';
import { PendingTasksScreen } from '../screens/PendingTasksScreen';
import { PriorityScreen } from '../screens/PriorityScreen';
import { RouteSettingsScreen } from '../screens/RouteSettingsScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { VoiceCaptureScreen } from '../screens/VoiceCaptureScreen';

export type OwnerStackParamList = {
  Home: undefined;
  // AC-43 (vòng 9) — `line` = chip lọc bật sẵn khi mở S1 (mục "Việc may vá" ở S0).
  Overview: { line?: LineFilter } | undefined;
  PendingTasks: undefined;
  VoiceCapture: undefined;
  CreateTask: undefined;
  IssueQr: undefined;
  Devices: undefined;
  BatQueue: undefined;
  AssignBatWorkers: { taskId: string };
  Priority: undefined;
  History: undefined;
  TaskDetail: { taskId: string };
  Feedback: undefined;
  // vòng 7 — mảng đệm ghế
  Orders: undefined;
  CreateOrder: undefined;
  OrderDetail: { orderId: string };
  CustomerLookup: undefined;
  CutDone: { orderId: string };
  Delivery: undefined;
  RouteSettings: undefined;
  AssignGroups: undefined;
};

const Stack = createNativeStackNavigator<OwnerStackParamList>();

// Chặn bấm 2 nút điều hướng khác nhau trong tích tắc (dogfood pha I vòng 2,
// kiểm thử): cả hai đều navigate trước khi màn đầu kịp rời đi, đẩy chồng 2 màn
// vào stack, Back phải bấm 2 lần mới đúng. Khoá ngay khi có một lượt điều hướng đang
// chạy, tự mở lại khi Home lấy lại focus (quay về từ màn con — Back hoặc "Giao việc" xong).
// S0 "Trang chủ" — gom lối vào theo mảng + cấu hình (OwnerMenuScreen). Trước vòng 7 đây là
// một phần của OwnerHomeScreen (10 nút chữ nối đuôi cuối danh sách việc); tách ra thành màn
// riêng khi mảng đệm mở, đủ 3 mảng để IA theo mảng có ý nghĩa thật (DECISIONS.md 2026-09-15).
function MenuRoute({ navigation }: { navigation: NativeStackNavigationProp<OwnerStackParamList, 'Home'> }) {
  const navigatingRef = useRef(false);

  useEffect(() => navigation.addListener('focus', () => {
    navigatingRef.current = false;
  }), [navigation]);

  function goOnce(fn: () => void) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    fn();
  }

  return (
    <OwnerMenuScreen
      onOverview={() => goOnce(() => navigation.navigate('Overview', { line: 'all' }))}
      onMayVa={() => goOnce(() => navigation.navigate('Overview', { line: 'may_va' }))}
      onPendingTasks={() => goOnce(() => navigation.navigate('PendingTasks'))}
      onPriority={() => goOnce(() => navigation.navigate('Priority'))}
      onDelivery={() => goOnce(() => navigation.navigate('Delivery'))}
      onCustomerLookup={() => goOnce(() => navigation.navigate('CustomerLookup'))}
      onBatQueue={() => goOnce(() => navigation.navigate('BatQueue'))}
      onOrders={() => goOnce(() => navigation.navigate('Orders'))}
      onHistory={() => goOnce(() => navigation.navigate('History'))}
      onIssueQr={() => goOnce(() => navigation.navigate('IssueQr'))}
      onDevices={() => goOnce(() => navigation.navigate('Devices'))}
      onRouteSettings={() => goOnce(() => navigation.navigate('RouteSettings'))}
      onAssignGroups={() => goOnce(() => navigation.navigate('AssignGroups'))}
      onFeedback={() => goOnce(() => navigation.navigate('Feedback'))}
      onVoiceCapture={() => goOnce(() => navigation.navigate('VoiceCapture'))}
    />
  );
}

// S1 "Cả xưởng hôm nay" — danh sách việc, mở từ S0. Trước vòng 7 đây là màn "Home" gốc.
function OverviewRoute({
  navigation,
  line,
  onCreateTask,
}: {
  navigation: NativeStackNavigationProp<OwnerStackParamList, 'Overview'>;
  line?: LineFilter;
  onCreateTask: () => void;
}) {
  const navigatingRef = useRef(false);

  useEffect(() => navigation.addListener('focus', () => {
    navigatingRef.current = false;
  }), [navigation]);

  function goOnce(fn: () => void) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    fn();
  }

  return (
    <OwnerHomeScreen
      onOpenTask={(taskId) => goOnce(() => navigation.navigate('TaskDetail', { taskId }))}
      onCreateTask={() => goOnce(onCreateTask)}
      onVoiceCapture={() => goOnce(() => navigation.navigate('VoiceCapture'))}
      initialFilter={line ?? 'all'}
    />
  );
}

// Vai owner (P-1) — lối tới capability đã giao (xem OwnerHomeScreen). CreateTask nhận
// prefill từ VoiceCapture qua state của navigator (không đi qua route params vì phải
// mang cả object ParsedUtterance, không chỉ chuỗi).
export function OwnerNavigator() {
  const [prefill, setPrefill] = useState<CreateTaskPrefill | undefined>(undefined);
  const [orderPrefill, setOrderPrefill] = useState<CreateOrderPrefill | undefined>(undefined);
  // dogfood pha I vòng 7: native-stack KHÔNG unmount
  // màn cũ khi điều hướng đi (giữ cho vuốt-lùi mượt) — quay lại "Ghi đơn mới" bằng Back phần
  // cứng trả về ĐÚNG instance cũ, còn nguyên banner "Đã ghi đơn" và dữ liệu form đã gửi.
  // Đổi `key` mỗi lần MỞ MỚI màn này buộc React tạo instance mới, bỏ hẳn state cũ.
  const [orderFormNonce, setOrderFormNonce] = useState(0);

  return (
    <Stack.Navigator
      screenOptions={{
        ...thinHeader,
        headerLeft: ({ canGoBack }) => (canGoBack ? <HeaderBackButton /> : undefined),
      }}
    >
      <Stack.Screen name="Home" options={{ headerShown: false }}>
        {({ navigation }) => <MenuRoute navigation={navigation} />}
      </Stack.Screen>
      <Stack.Screen name="Overview" options={{ headerShown: false }}>
        {({ navigation, route }) => (
          <OverviewRoute
            navigation={navigation}
            line={route.params?.line}
            onCreateTask={() => {
              setPrefill(undefined);
              navigation.navigate('CreateTask');
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="VoiceCapture" options={{ title: 'Cả xưởng' }}>
        {({ navigation }) => (
          <VoiceCaptureScreen
            onParsed={(result) => {
              setPrefill({
                content: result.content,
                dueAt: result.dueAt,
                assigneeId: result.assigneeId,
                line: result.line,
                measurements: result.measurements,
                suggestedAssigneeIds: result.suggestedAssigneeIds,
              });
              // replace, không navigate: Xong ở CreateTask phải quay thẳng về Home,
              // không lùi lại màn nghe giọng nói đã kết thúc.
              navigation.replace('CreateTask');
            }}
            onFallbackToManual={(partialHeard) => {
              setPrefill(partialHeard ? { content: partialHeard } : undefined);
              navigation.replace('CreateTask');
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="CreateTask" options={{ title: 'Xem lại rồi giao' }}>
        {({ navigation }) => (
          <CreateTaskScreen
            prefill={prefill}
            onDone={() => {
              setPrefill(undefined);
              navigation.goBack();
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="IssueQr" options={{ title: 'Cho người mới vào app' }} component={IssueQrScreen} />
      <Stack.Screen name="Devices" options={{ title: 'Cả xưởng' }}>
        {({ navigation }) => <DevicesScreen onIssueNew={() => navigation.navigate('IssueQr')} />}
      </Stack.Screen>
      <Stack.Screen name="BatQueue" options={{ title: 'Việc bạt chờ chia' }}>
        {({ navigation }) => (
          <BatQueueScreen onOpenTask={(taskId) => navigation.navigate('AssignBatWorkers', { taskId })} />
        )}
      </Stack.Screen>
      <Stack.Screen name="AssignBatWorkers" options={{ title: 'Chọn thợ để giao' }}>
        {({ navigation, route }) => (
          <AssignBatWorkersScreen taskId={route.params.taskId} onDone={() => navigation.goBack()} />
        )}
      </Stack.Screen>
      <Stack.Screen name="Priority" options={{ title: 'Cả xưởng' }} component={PriorityScreen} />
      {/* S16 — màn danh sách: C13(a) khối đầu mục, không phải thanh mảnh (DESIGN-SYSTEM.md §4) */}
      <Stack.Screen name="History" options={{ headerShown: false }}>
        {({ navigation }) => (
          <View style={{ flex: 1 }}>
            <ScreenHeader title="Việc đã xong" canGoBack />
            <HistoryScreen onOpenTask={(taskId) => navigation.navigate('TaskDetail', { taskId })} />
          </View>
        )}
      </Stack.Screen>
      <Stack.Screen name="TaskDetail" options={{ title: 'Cả xưởng' }}>
        {({ route }) => <TaskDetailScreen taskId={route.params.taskId} />}
      </Stack.Screen>
      <Stack.Screen name="Feedback" options={{ title: 'Cả xưởng' }}>
        {({ navigation }) => <FeedbackScreen onDone={() => navigation.goBack()} />}
      </Stack.Screen>

      {/* vòng 7 — mảng đệm ghế (CAP-DEM-01..07) */}
      <Stack.Screen name="Orders" options={{ headerShown: false }}>
        {({ navigation }) => (
          <OrderListScreen
            onOpenOrder={(orderId) => navigation.navigate('OrderDetail', { orderId })}
            onCreateOrder={() => {
              setOrderPrefill(undefined);
              setOrderFormNonce((n) => n + 1);
              navigation.navigate('CreateOrder');
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="CreateOrder" options={{ title: 'Ghi đơn mới' }}>
        {({ navigation }) => (
          <CreateOrderScreen
            key={orderFormNonce}
            prefill={orderPrefill}
            onDone={() => {
              setOrderPrefill(undefined);
              navigation.navigate('Orders');
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="OrderDetail" options={{ title: 'Chi tiết đơn' }}>
        {({ navigation, route }) => (
          <OrderDetailScreen
            orderId={route.params.orderId}
            onOpenTask={(taskId) => navigation.navigate('TaskDetail', { taskId })}
            onCutDone={() => navigation.navigate('CutDone', { orderId: route.params.orderId })}
            onMarkDelivered={() => navigation.navigate('Orders')}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="CustomerLookup" options={{ title: 'Cả xưởng' }}>
        {({ navigation }) => (
          <CustomerLookupScreen
            onUseMeasurements={(p) => {
              setOrderPrefill(p);
              setOrderFormNonce((n) => n + 1);
              navigation.navigate('CreateOrder');
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="CutDone" options={{ title: 'Tính cắt vải, mút' }}>
        {({ navigation, route }) => (
          <CutDoneScreen
            orderId={route.params.orderId}
            onDone={() => navigation.navigate('OrderDetail', { orderId: route.params.orderId })}
          />
        )}
      </Stack.Screen>
      {/* S23 — màn danh sách: C13(a) */}
      <Stack.Screen name="Delivery" options={{ headerShown: false }}>
        {({ navigation }) => (
          <View style={{ flex: 1 }}>
            <ScreenHeader title="Hàng trả" subtitle="Theo khu vực · chuyến chiều" canGoBack />
            <DeliveryScreen
              onOpenOrder={(orderId) => navigation.navigate('OrderDetail', { orderId })}
              onCreateOrder={() => navigation.navigate('CreateOrder')}
            />
          </View>
        )}
      </Stack.Screen>
      <Stack.Screen name="RouteSettings" options={{ title: 'Cả xưởng' }} component={RouteSettingsScreen} />
      {/* S31 (vòng 9, AC-41) — màn chi tiết/form: C13(b) thanh mảnh, vụn đường dẫn "Trang chủ"
          như prototype S31. */}
      <Stack.Screen name="PendingTasks" options={{ title: 'Trang chủ' }} component={PendingTasksScreen} />
      <Stack.Screen name="AssignGroups" options={{ title: 'Cả xưởng' }} component={AssignGroupsScreen} />
    </Stack.Navigator>
  );
}
