import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { Button } from 'react-native-paper';
import { HeaderBackButton } from './HeaderBackButton';
import { thinHeader } from './screenOptions';
import { ScreenHeader } from '../common/ScreenHeader';
import { colors } from '../theme/tokens';
import { useAuth } from '../auth/AuthContext';
import { AssignBatWorkersScreen } from '../screens/AssignBatWorkersScreen';
import { BatMenuScreen } from '../screens/BatMenuScreen';
import { SelfTaskScreen } from '../screens/SelfTaskScreen';
import { BatQueueScreen } from '../screens/BatQueueScreen';
import { FeedbackScreen } from '../screens/FeedbackScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { MyTasksScreen, type SelfTaskResult } from '../screens/MyTasksScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';

export type BatCoordinatorStackParamList = {
  Menu: undefined;
  SelfTask: undefined;
  BatQueue: undefined;
  AssignBatWorkers: { taskId: string };
  // dogfood vòng 9 (newbie) — S30 ghi xong quay về S6 kèm kết quả duyệt (Snackbar C15).
  MyTasks: { selfResult?: SelfTaskResult } | undefined;
  TaskDetail: { taskId: string };
  History: undefined;
  Feedback: undefined;
};

const Stack = createNativeStackNavigator<BatCoordinatorStackParamList>();

// Vai bat-coordinator (P-3, điều phối) — S9 là màn mở đầu (PROTOTYPE.md §2 sơ đồ điều hướng:
// "S9 -- tab 'Việc của tôi' -> S6", điều phối cũng là người làm việc như thợ bình thường).
// App này chưa dựng thanh tab đáy (C14) ở bất cứ vai nào (đã vậy từ vòng 1 —
// OwnerNavigator/WorkerNavigator cũng chỉ dùng Stack, không phải riêng quyết định của vòng
// này) nên dùng nút góc trên bên phải để chuyển qua lại, vẫn giữ đúng ngân sách ≤2 chạm.
export function BatCoordinatorNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        ...thinHeader,
        headerLeft: ({ canGoBack }) => (canGoBack ? <HeaderBackButton /> : undefined),
      }}
    >
      {/* S0 điều phối (vòng 9, AC-39) — màn mở đầu mới, thay S9. S9 vẫn giữ nguyên nút "Việc của
          tôi" ở khối đầu mục (không phá lối cũ điều phối đã quen). */}
      <Stack.Screen name="Menu" options={{ headerShown: false }}>
        {({ navigation }) => (
          <BatMenuScreen
            onBatQueue={() => navigation.navigate('BatQueue')}
            onMyTasks={() => navigation.navigate('MyTasks')}
            onHistory={() => navigation.navigate('History')}
            onFeedback={() => navigation.navigate('Feedback')}
          />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="BatQueue"
        options={{ headerShown: false }}
      >
        {({ navigation }) => (
          <View style={{ flex: 1 }}>
            {/* S9 — màn danh sách: C13(a) khối đầu mục. Nút CHỮ (không icon trần) giữ từ
                dogfood pha I vòng 4 — icon một mình làm điều phối phải bấm
                thử mới biết dẫn tới đâu, trái luật §4b. */}
            <ScreenHeader
              title="Việc bạt chờ chia"
              canGoBack
              right={
                <Button textColor={colors.onPrimary} onPress={() => navigation.navigate('MyTasks')}>
                  Việc của tôi
                </Button>
              }
            />
            <BatQueueScreen onOpenTask={(taskId) => navigation.navigate('AssignBatWorkers', { taskId })} />
          </View>
        )}
      </Stack.Screen>
      <Stack.Screen name="AssignBatWorkers" options={{ title: 'Chọn thợ để giao' }}>
        {({ navigation, route }) => (
          <AssignBatWorkersScreen taskId={route.params.taskId} onDone={() => navigation.goBack()} />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="MyTasks"
        options={{ headerShown: false }}
      >
        {({ navigation, route }) => (
          <View style={{ flex: 1 }}>
            {/* S6 — màn danh sách: C13(a). hitSlop giữ từ dogfood pha I vòng 5. */}
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
                      trạng thái "Xong" trên thẻ việc, route vẫn tới History như cũ */}
                  Lịch sử
                </Button>
              }
            />
            {/* AC-40 (vòng 9) — điều phối tự ghi việc như thợ (mảng = bạt, server tự lấy). */}
            <MyTasksScreen
              onOpenTask={(taskId) => navigation.navigate('TaskDetail', { taskId })}
              onSelfTask={() => navigation.navigate('SelfTask')}
              selfResult={route.params?.selfResult}
            />
          </View>
        )}
      </Stack.Screen>
      {/* S30 (vòng 9) — form: C13(b) thanh mảnh, vụn đường dẫn "Việc của tôi". */}
      <Stack.Screen name="SelfTask" options={{ title: 'Việc của tôi' }}>
        {({ navigation }) => (
          <SelfTaskScreen
            onDone={(approval) =>
              navigation.popTo('MyTasks', { selfResult: { approval, at: Date.now() } }, { merge: true })
            }
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="TaskDetail" options={{ title: 'Việc bạt chờ chia' }}>
        {({ route }) => <TaskDetailScreen taskId={route.params.taskId} />}
      </Stack.Screen>
      <Stack.Screen
        name="History"
        options={{ headerShown: false }}
      >
        {({ navigation }) => {
          // AC-31 (vòng 8, CAP-BUG-03) — điều phối cũng chưa có S0/màn "Cài đặt" riêng, gắn
          // "Đăng xuất" ở màn phụ "Việc đã xong" như worker.
          const { logout } = useAuth();
          return (
            <View style={{ flex: 1 }}>
              {/* S16 — màn danh sách: C13(a) */}
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
