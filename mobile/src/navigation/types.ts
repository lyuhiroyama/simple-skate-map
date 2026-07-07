import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Tabs: undefined;
  SpotDetail: { spotId: string; spotName: string };
  AddSpot: { latitude: number; longitude: number };
  GroupDetail: { groupId: string; groupName: string };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
