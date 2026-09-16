import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Button } from 'react-native-paper';
import { HeaderBackButton } from './HeaderBackButton';
import { FeedbackScreen } from '../screens/FeedbackScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { MyTasksScreen } from '../screens/MyTasksScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';

export type WorkerStackParamList = {
  MyTasks: undefined;
  TaskDetail: { taskId: string };
  History: undefined;
  Feedback: undefined;
};

const Stack = createNativeStackNavigator<WorkerStackParamList>();

// Vai worker (P-2) — S6 → S7. CAP-TASK-15 (AC-16, vòng 5): nút góc trên "Đã xong" dẫn tới
// S16 — cùng cách BatCoordinatorNavigator đã dùng cho "Việc của tôi" (chưa dựng tab đáy C14).
export function WorkerNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{ headerLeft: ({ canGoBack }) => (canGoBack ? <HeaderBackButton /> : undefined) }}
    >
      <Stack.Screen
        name="MyTasks"
        options={({ navigation }) => ({
          title: 'Việc của tôi',
          // dogfood pha I vòng 5: nút mặc định của react-native-paper
          // trong header cao ~38dp — dưới cả 44dp MD3 lẫn --tap-min 64px đã chốt riêng cho
          // app này (DESIGN-SYSTEM.md §2.3). Header bar không đủ chỗ để phóng to nút mà
          // không vỡ layout, nên mở rộng VÙNG CHẠM (không đổi kích thước nhìn thấy) bằng
          // hitSlop tới gần 64dp theo chiều cao.
          headerRight: () => (
            <Button onPress={() => navigation.navigate('History')} hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}>
              Đã xong
            </Button>
          ),
        })}
      >
        {({ navigation }) => (
          <MyTasksScreen onOpenTask={(taskId) => navigation.navigate('TaskDetail', { taskId })} />
        )}
      </Stack.Screen>
      <Stack.Screen name="TaskDetail" options={{ title: 'Chi tiết việc' }}>
        {({ route }) => <TaskDetailScreen taskId={route.params.taskId} />}
      </Stack.Screen>
      <Stack.Screen
        name="History"
        options={({ navigation }) => ({
          title: 'Việc đã xong',
          // Nhóm 4 production-ready (kênh feedback, review pha P vòng 6) — đặt ở màn phụ
          // (không phải "Việc của tôi") để không chen thêm nút vào header chính.
          headerRight: () => <Button onPress={() => navigation.navigate('Feedback')}>Góp ý</Button>,
        })}
      >
        {({ navigation }) => (
          <HistoryScreen onOpenTask={(taskId) => navigation.navigate('TaskDetail', { taskId })} />
        )}
      </Stack.Screen>
      <Stack.Screen name="Feedback" options={{ title: 'Góp ý' }}>
        {({ navigation }) => <FeedbackScreen onDone={() => navigation.goBack()} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
