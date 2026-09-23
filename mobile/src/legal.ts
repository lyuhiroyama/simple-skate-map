export const SUPPORT_EMAIL = 'beanface.studios@gmail.com';

export const PRIVACY_SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What this app is',
    body: 'Simple Skate Map is for documenting street architecture and clips with people you invite. It is not a guidebook. Do not trespass.',
  },
  {
    title: 'What we collect',
    body: 'When you sign in with Apple or Google we receive an account identifier from that provider. We store a username you choose, spots you pin (name, notes, address, map coordinates), photos and videos you upload, group membership, and chat messages you send. We use your location on device to place pins and to open the map near you. We do not run a background location tracker.',
  },
  {
    title: 'How we use it',
    body: 'We use this data only to run the app: show your map, share spots with groups you join, deliver chat, and enforce safety tools (filter, report, block). We do not sell your information or show ads.',
  },
  {
    title: 'Who can see it',
    body: 'Spots you keep to yourself stay private. Spots you share with a group, and messages in that group, are visible to members of that group. If you report content, we store the report so we can act on it.',
  },
  {
    title: 'Keeping it',
    body: 'We keep your data until you delete your account. Deleting your account removes your login. Messages and spots you created stay visible to people who already had them, labeled Deleted Account. Groups you own are transferred to another member when one exists, or removed if you were the only member.',
  },
  {
    title: 'Safety',
    body: 'You can report a message or spot, and block a person so you stop seeing their content. Unblock people in Groups → Privacy & account. Chat and spot text is filtered for language we do not allow. To report a problem or ask us to remove content, email support.',
  },
  {
    title: 'Children',
    body: 'Simple Skate Map is not directed at children under 13, and we do not knowingly collect information from them.',
  },
  {
    title: 'Contact',
    body: `Questions or deletion requests: ${SUPPORT_EMAIL}`,
  },
];
