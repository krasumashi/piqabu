import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

export interface LinkedPartner {
    id: string; // The permanent UUID used as the 'roomId'
    partnerDeviceId: string;
    name: string;
    addedAt: number;
}

const STORAGE_KEY = '@piqabu_linked_partners';

export function useLinkedPartners() {
    const [partners, setPartners] = useState<LinkedPartner[]>([]);

    const loadPartners = async () => {
        try {
            const data = await AsyncStorage.getItem(STORAGE_KEY);
            if (data) {
                setPartners(JSON.parse(data));
            }
        } catch (e) {
            console.error('Failed to load linked partners:', e);
        }
    };

    useEffect(() => {
        loadPartners();
    }, []);

    const addPartner = async (partnerDeviceId: string, existingRoomId?: string) => {
        // We'll generate a secure, permanent Room ID if one isn't provided
        const roomId = existingRoomId || `SYNC_${Crypto.randomUUID()}`;
        
        const newPartner: LinkedPartner = {
            id: roomId,
            partnerDeviceId,
            name: `Partner ${partners.length + 1}`,
            addedAt: Date.now(),
        };
        
        const updated = [...partners, newPartner];
        setPartners(updated);
        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
            console.error('Failed to save partner:', e);
        }

        return newPartner;
    };

    const removePartner = async (id: string) => {
        const updated = partners.filter(p => p.id !== id);
        setPartners(updated);
        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
            console.error('Failed to remove partner:', e);
        }
    };

    const updatePartnerName = async (id: string, newName: string) => {
        const updated = partners.map(p => p.id === id ? { ...p, name: newName } : p);
        setPartners(updated);
        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
            console.error('Failed to update partner:', e);
        }
    };

    return {
        partners,
        addPartner,
        removePartner,
        updatePartnerName,
        refreshPartners: loadPartners,
    };
}
