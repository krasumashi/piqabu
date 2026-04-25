import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoomContext } from '../contexts/RoomContext';

export const FREE_DAILY_LIMIT_MS = 10 * 60 * 1000; // 10 minutes

export function useFreemiumTimer(isActiveConnection: boolean) {
    const { isPro } = useRoomContext();
    const [usageMs, setUsageMs] = useState(0);
    const [isTimeUp, setIsTimeUp] = useState(false);

    useEffect(() => {
        // Load initial usage for today
        const loadUsage = async () => {
            try {
                const today = new Date().toISOString().split('T')[0];
                const stored = await AsyncStorage.getItem(`piqabu_usage_${today}`);
                if (stored) {
                    const parsed = parseInt(stored, 10);
                    setUsageMs(parsed);
                    if (parsed >= FREE_DAILY_LIMIT_MS && !isPro) {
                        setIsTimeUp(true);
                    }
                }
            } catch (e) {}
        };
        loadUsage();
    }, [isPro]);

    useEffect(() => {
        if (!isActiveConnection || isPro || isTimeUp) return;

        const interval = setInterval(() => {
            setUsageMs((prev) => {
                const next = prev + 1000;
                
                // Save to storage every 5 seconds to reduce disk IO
                if (next % 5000 === 0) {
                    const today = new Date().toISOString().split('T')[0];
                    AsyncStorage.setItem(`piqabu_usage_${today}`, next.toString()).catch(() => {});
                }

                if (next >= FREE_DAILY_LIMIT_MS) {
                    setIsTimeUp(true);
                }
                return next;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isActiveConnection, isPro, isTimeUp]);

    // Force disconnect function when time is up
    const forceDisconnect = () => {
        // Could be wired up natively
    }

    return { usageMs, isTimeUp, isPro };
}
