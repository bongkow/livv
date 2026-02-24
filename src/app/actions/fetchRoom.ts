"use server";

import { DynamoDBClient, GetItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createHash } from "crypto";
import type { RoomType } from "@/stores/useChatStore";

const ROOMS_TABLE_NAME = "Rooms";

const dynamoClient = new DynamoDBClient({
    region: process.env.AWS_REGION,
});

export interface RoomData {
    channelHash: string;
    roomName: string;
    leader: string;
    roomType: RoomType;
    createdAt: string;
    maxPeersPerRoom?: number;
}

function hashRoomNameServer(roomName: string): string {
    return createHash("sha256").update(roomName).digest("hex");
}

export async function fetchRoomByName(roomName: string): Promise<RoomData | null> {
    const channelHash = hashRoomNameServer(roomName);

    const result = await dynamoClient.send(
        new GetItemCommand({
            TableName: ROOMS_TABLE_NAME,
            Key: {
                channelHash: { S: channelHash },
            },
        })
    );

    if (!result.Item) return null;

    return unmarshall(result.Item) as RoomData;
}

export async function fetchAllRooms(): Promise<RoomData[]> {
    const result = await dynamoClient.send(
        new ScanCommand({
            TableName: ROOMS_TABLE_NAME,
        })
    );

    if (!result.Items || result.Items.length === 0) return [];

    return result.Items.map((item) => unmarshall(item) as RoomData);
}

