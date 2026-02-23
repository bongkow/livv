import { appConfig } from "@/config/appConfig";
import { hashRoomName } from "@/utils/hashRoomName";

export interface RoomData {
  channelHash: string;
  roomName: string;
  leader: string;
  roomType: string;
  createdAt: string;
}

export async function fetchRoomByName(
  roomName: string
): Promise<RoomData | null> {
  const channelHash = await hashRoomName(roomName);

  const response = await fetch(
    `${appConfig.authApiBaseUrl}/public/rooms/${channelHash}`
  );

  if (!response.ok) return null;

  return response.json();
}

export async function fetchAllRooms(): Promise<RoomData[]> {
  const response = await fetch(`${appConfig.authApiBaseUrl}/public/rooms`);

  if (!response.ok) return [];

  return response.json();
}
