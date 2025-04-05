import { TradingService } from "./TradingService.js";

/**
 * Load all available services
 */
export async function loadServices(agent) {
    const services = [
        TradingService,
    ];

    const results = await Promise.all(
        services.map(async (Service) => {
            try {
                const service = new Service(agent);
                await service.start();
                if (service) {
                    console.log(`✅ ${service.name} service initialized`);
                    return service;
                }
                return null;
            } catch (error) {
                console.error("Failed to initialize service:", error);
                return null;
            }
        })
    );

    // Filter out any null results
    return results.filter((service) => service !== null);
}
