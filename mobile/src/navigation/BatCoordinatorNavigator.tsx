import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Button } from 'react-native-paper';
import { HeaderBackButton } from './HeaderBackButton';
import { AssignBatWorkersScreen } from '../screens/AssignBatWorkersScreen';
import { BatQueueScreen } from '../screens/BatQueueScreen';
import { FeedbackScreen } from '../screens/FeedbackScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { MyTasksScreen } from '../screens/MyTasksScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';

export type BatCoordinatorStackParamList = {
  BatQueue: undefined;
  AssignBatWorkers: { taskId: string };
  MyTasks: undefined;
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
    <Stack.Navigator screenOptions={{ headerLeft: ({ canGoBack }) => (canGoBack ? <HeaderBackButton /> : undefined) }}>
      <Stack.Screen
        name="BatQueue"
        options={({ navigation }) => ({
          title: 'Việc bạt chờ chia',
          // dogfood pha I vòng 4: nút góc trên chỉ có icon, không chữ —
          // điều phối phải bấm thử mới biết dẫn tới đâu. Đổi sang nút CHỮ, đúng luật §4b
          // "không dùng icon một mình thay cho chữ" tinh thần chung của cả app.
          headerRight: () => <Button onPress={() => navigation.navigate('MyTasks')}>Việc của tôi</Button>,
        })}
      >
        {({ navigation }) => (
          <BatQueueScreen onOpenTask={(taskId) => navigation.navigate('AssignBatWorkers', { taskId })} />
        )}
      </Stack.Screen>
      <Stack.Screen name="AssignBatWorkers" options={{ title: 'Chọn thợ để giao' }}>
        {({ navigation, route }) => (
          <AssignBatWorkersScreen taskId={route.params.taskId} onDone={() => navigation.goBack()} />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="MyTasks"
        options={({ navigation }) => ({
          title: 'Việc của tôi',
          // dogfood pha I vòng 5 — xem WorkerNavigator.tsx: nút header
          // mặc định ~38dp cao, dưới --tap-min 64px; mở rộng vùng chạm bằng hitSlop.
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
