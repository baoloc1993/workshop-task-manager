import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { Button } from 'react-native-paper';
import { HeaderBackButton } from './HeaderBackButton';
import { thinHeader } from './screenOptions';
import { colors } from '../theme/tokens';
import { ScreenHeader } from '../common/ScreenHeader';
import { useAuth } from '../auth/AuthContext';
import { DemQueueScreen } from '../screens/DemQueueScreen';
import { FeedbackScreen } from '../screens/FeedbackScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { MyTasksScreen, type SelfTaskResult } from '../screens/MyTasksScreen';
import { SelfTaskScreen } from '../screens/SelfTaskScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { WorkerMenuScreen } from '../screens/WorkerMenuScreen';

export type WorkerStackParamList = {
  Menu: undefined;
  // dogfood vòng 9 (newbie) — S30 ghi xong quay về S6 kèm kết quả duyệt để S6 hiện Snackbar.
  MyTasks: { selfResult?: SelfTaskResult } | undefined;
  TaskDetail: { taskId: string };
  History: undefined;
  Feedback: undefined;
  DemQueue: undefined;
  SelfTask: undefined;
};

const Stack = createNativeStackNavigator<WorkerStackParamList>();

// Vai worker (P-2) — S0 → S6 → S7. dogfood vòng 9 (newbie): trước đây màn đầu là S6 với
// nút ‹ của C13(a) — màn gốc nên GO_BACK không ai xử lý, bấm ‹ không đi đâu. Nay S0 thợ
// (WorkerMenuScreen, C14) là màn đầu, gom các lối trước nằm ở khe phải S6 / S16:
// "Việc nhóm chờ nhận" (S22), "Đã xong tuần này" (S16), "Góp ý", "Đăng xuất".
// vòng 7 — CAP-DEM-07 từng cho nút S22 LUÔN hiện với mọi worker vì `user.groups` chỉ đọc lúc
// đăng nhập (không có /users/me). Từ vòng 9 S0 chỉ hiện mục này cho thợ mảng đệm theo
// `isDemWorker` (bảng khối mục S0 tách `worker` vòng 1–6 khỏi `may` vòng 7) — `line` do API
// trả ở hồ sơ đăng nhập, ổn định hơn `groups`; thợ vừa đổi mảng thì đăng nhập lại mới thấy.
export function WorkerNavigator() {
  const { user } = useAuth();
  // AC-40 (vòng 9) — thợ mảng đệm KHÔNG có lối S30 (việc đệm đi theo đơn/hàng đợi nhóm;
  // API trả 400 nếu gọi). `line` chỉ có trong hồ sơ nếu API trả; thiếu thì nhận biết thợ
  // đệm qua nhóm chuyên trách (`groups` chỉ có nghĩa với mảng đệm — ARCHITECTURE.md §6).
  const isDemWorker = user?.line === 'dem' || (!user?.line && (user?.groups?.length ?? 0) > 0);
  return (
    <Stack.Navigator
      screenOptions={{
        ...thinHeader,
        headerLeft: ({ canGoBack }) => (canGoBack ? <HeaderBackButton /> : undefined),
      }}
    >
      {/* S0 thợ (dogfood vòng 9, newbie) — màn mở đầu, C14. */}
      <Stack.Screen name="Menu" options={{ headerShown: false }}>
        {({ navigation }) => (
          <WorkerMenuScreen
            isDemWorker={isDemWorker}
            onMyTasks={() => navigation.navigate('MyTasks')}
            onDemQueue={() => navigation.navigate('DemQueue')}
            onHistory={() => navigation.navigate('History')}
            onFeedback={() => navigation.navigate('Feedback')}
          />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="MyTasks"
        options={{ headerShown: false }}
      >
        {({ navigation, route }) => (
          <View style={{ flex: 1 }}>
            {/* S6 — màn danh sách: C13(a). ‹ nay quay về S0. dogfood vòng 9 (newbie): bỏ nút
                "Việc nhóm" ở khe phải — S0 đã có "Việc nhóm chờ nhận" (và chỉ cho thợ mảng
                đệm, người khác bấm vào chỉ thấy danh sách rỗng). Giữ "Lịch sử" cho cùng một
                khuôn với S6 của điều phối (BatCoordinatorNavigator) — một chạm tới việc vừa xong.
                hitSlop giữ nguyên từ dogfood pha I vòng 5: nút của
                react-native-paper cao ~38dp, dưới --tap-min, mở rộng vùng chạm thay vì
                phóng to nút cho khỏi vỡ layout. */}
            <ScreenHeader
              title="Việc của tôi"
              canGoBack
              right={
                <Button
                  textColor={colors.onPrimary}
                  onPress={() => navigation.navigate('History')}
                  hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
                >
                  {/* AC-40 điểm (5), DECISIONS.md 2026-09-19: đổi nhãn — trùng chữ với nhãn
                      trạng thái "Xong" trên thẻ việc (TaskRow), route vẫn tới History như cũ */}
                  Lịch sử
                </Button>
              }
            />
            <MyTasksScreen
              onOpenTask={(taskId) => navigation.navigate('TaskDetail', { taskId })}
              onSelfTask={isDemWorker ? undefined : () => navigation.navigate('SelfTask')}
              selfResult={route.params?.selfResult}
            />
          </View>
        )}
      </Stack.Screen>
      {/* S30 (vòng 9) — form: C13(b) thanh mảnh, vụn đường dẫn "Việc của tôi".
          dogfood vòng 9 (newbie): về S6 bằng popTo kèm kết quả duyệt (Snackbar C15 ở S6). */}
      <Stack.Screen name="SelfTask" options={{ title: 'Việc của tôi' }}>
        {({ navigation }) => (
          <SelfTaskScreen
            onDone={(approval) =>
              navigation.popTo('MyTasks', { selfResult: { approval, at: Date.now() } }, { merge: true })
            }
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="TaskDetail" options={{ title: 'Việc của tôi' }}>
        {({ route }) => <TaskDetailScreen taskId={route.params.taskId} />}
      </Stack.Screen>
      {/* S22 — màn danh sách: C13(a) */}
      <Stack.Screen name="DemQueue" options={{ headerShown: false }}>
        {({ navigation }) => (
          <View style={{ flex: 1 }}>
            <ScreenHeader title="Việc nhóm chờ nhận" subtitle="Ai rảnh thì nhận" canGoBack />
            <DemQueueScreen onOpenTask={(taskId) => navigation.navigate('TaskDetail', { taskId })} />
          </View>
        )}
      </Stack.Screen>
      <Stack.Screen
        name="History"
        options={{ headerShown: false }}
      >
        {({ navigation }) => (
          <View style={{ flex: 1 }}>
            {/* S16 — màn danh sách: C13(a). AC-31 (vòng 8) từng gắn "Góp ý" + "Đăng xuất" ở
                khe phải màn này vì thợ chưa có S0; dogfood vòng 9 (newbie) chuyển cả hai về
                S0 thợ (WorkerMenuScreen) — cùng chỗ với S0 chủ xưởng / điều phối. */}
            <ScreenHeader title="Việc đã xong" canGoBack />
            <HistoryScreen onOpenTask={(taskId) => navigation.navigate('TaskDetail', { taskId })} />
          </View>
        )}
      </Stack.Screen>
      {/* Vụn đường dẫn C13(b): Góp ý nay mở từ S0 thợ (dogfood vòng 9, newbie). */}
      <Stack.Screen name="Feedback" options={{ title: 'Trang chủ' }}>
        {({ navigation }) => <FeedbackScreen onDone={() => navigation.goBack()} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
