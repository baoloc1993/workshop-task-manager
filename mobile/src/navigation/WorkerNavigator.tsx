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
import { MyTasksScreen } from '../screens/MyTasksScreen';
import { SelfTaskScreen } from '../screens/SelfTaskScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';

export type WorkerStackParamList = {
  MyTasks: undefined;
  TaskDetail: { taskId: string };
  History: undefined;
  Feedback: undefined;
  DemQueue: undefined;
  SelfTask: undefined;
};

const Stack = createNativeStackNavigator<WorkerStackParamList>();

// Vai worker (P-2) — S6 → S7. CAP-TASK-15 (AC-16, vòng 5): nút góc trên "Đã xong" dẫn tới
// S16 — cùng cách BatCoordinatorNavigator đã dùng cho "Việc của tôi" (chưa dựng tab đáy C14).
// vòng 7 — CAP-DEM-07: nút "Việc nhóm chờ nhận" (S22) LUÔN hiện cho worker, kể cả chưa
// được phân nhóm nào — `user.groups` chỉ được đọc lúc đăng nhập/quét mã, không tự làm mới
// khi chủ xưởng đổi Phân vai (S26) trong lúc thợ đang mở app (không có endpoint /users/me
// để refetch). Ẩn nút theo `user.groups` cũ sẽ tạo cảm giác "hiệu lực ngay" (chốt ở S26)
// không đúng cho người vừa được thêm vào nhóm — DECISIONS.md vòng 7. GET /tasks/dem-queue
// đã tự trả rỗng đúng nghĩa khi `groups` rỗng, nên hiện nút luôn là an toàn.
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
      <Stack.Screen
        name="MyTasks"
        options={{ headerShown: false }}
      >
        {({ navigation }) => (
          <View style={{ flex: 1 }}>
            {/* S6 — màn danh sách: C13(a). Hai nút điều hướng trước nằm ở `headerRight` của
                native-stack; thợ chưa có S0 nên chúng là đường đi duy nhất tới hai màn kia,
                chuyển vào khe `right` của khối đầu mục (DECISIONS.md 2026-09-19).
                hitSlop giữ nguyên từ dogfood pha I vòng 5: nút của
                react-native-paper cao ~38dp, dưới --tap-min, mở rộng vùng chạm thay vì
                phóng to nút cho khỏi vỡ layout. */}
            <ScreenHeader
              title="Việc của tôi"
              canGoBack
              right={
                <>
                  <Button
                    textColor={colors.onPrimary}
                    onPress={() => navigation.navigate('DemQueue')}
                    hitSlop={{ top: 14, bottom: 14, left: 4, right: 4 }}
                  >
                    Việc nhóm
                  </Button>
                  <Button
                    textColor={colors.onPrimary}
                    onPress={() => navigation.navigate('History')}
                    hitSlop={{ top: 14, bottom: 14, left: 4, right: 8 }}
                  >
                    {/* AC-40 điểm (5), DECISIONS.md 2026-09-19: đổi nhãn — trùng chữ với nhãn
                        trạng thái "Xong" trên thẻ việc (TaskRow), route vẫn tới History như cũ */}
                    Lịch sử
                  </Button>
                </>
              }
            />
            <MyTasksScreen
              onOpenTask={(taskId) => navigation.navigate('TaskDetail', { taskId })}
              onSelfTask={isDemWorker ? undefined : () => navigation.navigate('SelfTask')}
            />
          </View>
        )}
      </Stack.Screen>
      {/* S30 (vòng 9) — form: C13(b) thanh mảnh, vụn đường dẫn "Việc của tôi". */}
      <Stack.Screen name="SelfTask" options={{ title: 'Việc của tôi' }}>
        {({ navigation }) => <SelfTaskScreen onDone={() => navigation.goBack()} />}
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
        {({ navigation }) => {
          // AC-31 (vòng 8, CAP-BUG-03) — thợ chưa có S0 riêng, "Việc đã xong" (nay đổi nhãn
          // nút thành "Lịch sử") là màn phụ chung duy nhất còn trống chỗ ở khối đầu mục —
          // gắn "Đăng xuất" ở đây thay vì dựng thêm một màn "Cài đặt" chỉ cho một nút.
          const { logout } = useAuth();
          return (
            <View style={{ flex: 1 }}>
              {/* S16 — màn danh sách: C13(a). "Góp ý" (nhóm 4 production-ready) giữ ở màn phụ
                  này, không chen vào khối đầu mục của "Việc của tôi". */}
              <ScreenHeader
                title="Việc đã xong"
                canGoBack
                right={
                  <>
                    <Button textColor={colors.onPrimary} onPress={() => navigation.navigate('Feedback')}>
                      Góp ý
                    </Button>
                    <Button textColor={colors.onPrimary} onPress={() => logout()}>
                      Đăng xuất
                    </Button>
                  </>
                }
              />
              <HistoryScreen onOpenTask={(taskId) => navigation.navigate('TaskDetail', { taskId })} />
            </View>
          );
        }}
      </Stack.Screen>
      <Stack.Screen name="Feedback" options={{ title: 'Việc đã xong' }}>
        {({ navigation }) => <FeedbackScreen onDone={() => navigation.goBack()} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
