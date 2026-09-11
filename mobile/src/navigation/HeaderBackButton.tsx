import { IconButton } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { tapMin } from '../theme/tokens';

// Nút quay lại mặc định của native-stack ~56dp, dưới ngân sách chạm 64dp
// (STATE.md dogfood 2026-09-10, DESIGN-SYSTEM.md §4c) — thay bằng nút tự vẽ đủ khổ.
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
