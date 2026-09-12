import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { IconButton } from 'react-native-paper';
import { HeaderBackButton } from './HeaderBackButton';
import { AssignBatWorkersScreen } from '../screens/AssignBatWorkersScreen';
import { BatQueueScreen } from '../screens/BatQueueScreen';
import { MyTasksScreen } from '../screens/MyTasksScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { tapMin } from '../theme/tokens';

export type BatCoordinatorStackParamList = {
  BatQueue: undefined;
  AssignBatWorkers: { taskId: string };
  MyTasks: undefined;
  TaskDetail: { taskId: string };
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
          headerRight: () => (
            <IconButton
              icon="account-check"
              size={28}
              accessibilityLabel="Việc của tôi"
              style={{ margin: 0, width: tapMin, height: tapMin }}
              onPress={() => navigation.navigate('MyTasks')}
            />
          ),
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
      <Stack.Screen name="MyTasks" options={{ title: 'Việc của tôi' }}>
        {({ navigation }) => (
          <MyTasksScreen onOpenTask={(taskId) => navigation.navigate('TaskDetail', { taskId })} />
        )}
      </Stack.Screen>
      <Stack.Screen name="TaskDetail" options={{ title: 'Chi tiết việc' }}>
        {({ route }) => <TaskDetailScreen taskId={route.params.taskId} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
