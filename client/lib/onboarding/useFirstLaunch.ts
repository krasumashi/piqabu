import { useState, useEffect, useCallback } from 'react';
import { getSecureItem, setSecureItem } from '../platform/storage';

const ONBOARDED_KEY = 'piqabu_onboarded';

export function useFirstLaunch() {
    const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);

    useEffect(() => {
        getSecureItem(ONBOARDED_KEY).then((val) => {
            setIsFirstLaunch(val !== 'true');
        });
    }, []);

    const completeOnboarding = useCallback(async () => {
        await setSecureItem(ONBOARDED_KEY, 'true');
        setIsFirstLaunch(false);
    }, []);

    return { isFirstLaunch, completeOnboarding };
}
