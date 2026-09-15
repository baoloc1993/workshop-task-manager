import { IconButton } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { tapMin } from '../theme/tokens';

// Nút quay lại tự vẽ, đủ khổ --tap-min (DESIGN-SYSTEM.md §2.3) — ban đầu thay cho nút mặc
// định của native-stack (~56dp) lúc --tap-min còn là 64px (STATE.md dogfood 2026-09-10);
// từ 2026-09-15 --tap-min về 48px nhưng vẫn giữ nút tự vẽ để cỡ luôn khớp đúng token.
export function HeaderBackButton() {
  const navigation = useNavigation();
  return (
    <IconButton
      icon="arrow-left"
      size={28}
      onPress={() => navigation.goBack()}
      accessibilityLabel="Quay lại"
      style={styles.button}
    />
  );
}

const styles = {
  button: { margin: 0, width: tapMin, height: tapMin, borderRadius: 0 },
};
