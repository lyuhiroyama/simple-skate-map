import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Tabs: undefined;
  SpotDetail: { spotId: string; spotName: string };
  AddSpot: { latitude: number; longitude: number };
  GroupDetail: { groupId: string; groupName: string };
  GroupMedia: { groupId: string; groupName: string };
  Legal: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
