import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { Button } from 'react-native-paper';
import { HeaderBackButton } from './HeaderBackButton';
import { thinHeader } from './screenOptions';
import { ScreenHeader } from '../common/ScreenHeader';
import { colors } from '../theme/tokens';
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
    <Stack.Navigator
      screenOptions={{
        ...thinHeader,
        headerLeft: ({ canGoBack }) => (canGoBack ? <HeaderBackButton /> : undefined),
      }}
    >
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
        {({ navigation }) => (
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
                  Đã xong
                </Button>
              }
            />
            <MyTasksScreen onOpenTask={(taskId) => navigation.navigate('TaskDetail', { taskId })} />
          </View>
        )}
      </Stack.Screen>
      <Stack.Screen name="TaskDetail" options={{ title: 'Việc bạt chờ chia' }}>
        {({ route }) => <TaskDetailScreen taskId={route.params.taskId} />}
      </Stack.Screen>
      <Stack.Screen
        name="History"
        options={{ headerShown: false }}
      >
        {({ navigation }) => (
          <View style={{ flex: 1 }}>
            {/* S16 — màn danh sách: C13(a) */}
            <ScreenHeader
              title="Việc đã xong"
              canGoBack
              right={
                <Button textColor={colors.onPrimary} onPress={() => navigation.navigate('Feedback')}>
                  Góp ý
                </Button>
              }
            />
            <HistoryScreen onOpenTask={(taskId) => navigation.navigate('TaskDetail', { taskId })} />
          </View>
        )}
      </Stack.Screen>
      <Stack.Screen name="Feedback" options={{ title: 'Việc đã xong' }}>
        {({ navigation }) => <FeedbackScreen onDone={() => navigation.goBack()} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
