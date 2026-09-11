import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HeaderBackButton } from './HeaderBackButton';
import { MyTasksScreen } from '../screens/MyTasksScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';

export type WorkerStackParamList = {
  MyTasks: undefined;
  TaskDetail: { taskId: string };
};

const Stack = createNativeStackNavigator<WorkerStackParamList>();

// Vai worker/bat-coordinator (P-2/P-3) — S6 → S7. Vòng 1 chưa có nút trạng thái.
export function WorkerNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{ headerLeft: ({ canGoBack }) => (canGoBack ? <HeaderBackButton /> : undefined) }}
    >
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
