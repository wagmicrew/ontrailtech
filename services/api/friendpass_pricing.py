"""
FriendPass Pricing Calculator with Reputation System
Calculates FriendPass prices based on supply, reputation, and tax configuration.
Supports volatile vs reputation-based pricing split and tax distribution analysis.
"""
import logging
from decimal import Decimal
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import FriendPassConfig, User

logger = logging.getLogger(__name__)


class FriendPassPricingCalculator:
    """
    Calculator for FriendPass pricing with reputation-based adjustments
    and tax distribution analysis.
    """
    
    def __init__(self, config: FriendPassConfig):
        self.config = config
    
    def calculate_base_price(self, supply: int) -> Decimal:
        """
        Calculate base price using linear formula: basePrice + slope * supply
        """
        base = Decimal(str(self.config.base_price_eth))
        slope = Decimal(str(self.config.slope_eth))
        return base + (slope * Decimal(supply))
    
    def calculate_reputation_multiplier(self, reputation: float) -> Decimal:
        """
        Calculate reputation-based price multiplier.
        Higher reputation = higher multiplier (if enabled).
        """
        if not self.config.reputation_enabled:
            return Decimal("1.0")
        
        if reputation < self.config.reputation_base_threshold:
            return Decimal("1.0")
        
        # Calculate multiplier based on reputation above threshold
        excess_reputation = reputation - self.config.reputation_base_threshold
        multiplier = Decimal(str(self.config.reputation_multiplier))
        
        # Apply logarithmic scaling to prevent excessive prices
        # multiplier = 1 + (multiplier * log(1 + excess_reputation / 100))
        import math
        scaled_multiplier = 1 + (float(multiplier) * math.log(1 + excess_reputation / 100.0))
        
        return Decimal(str(scaled_multiplier))
    
    def calculate_price_breakdown(
        self,
        supply: int,
        reputation: float = 0.0
    ) -> Dict[str, Any]:
        """
        Calculate total price with volatile vs reputation split.
        
        Returns:
            Dict with:
            - total_price_eth: Total price in ETH
            - volatile_portion_eth: Portion based on market/supply
            - reputation_portion_eth: Portion based on reputation
            - breakdown_percentages: Percentage split
        """
        base_price = self.calculate_base_price(supply)
        rep_multiplier = self.calculate_reputation_multiplier(reputation)
        
        # Calculate reputation-adjusted price
        reputation_price = base_price * rep_multiplier
        
        # Split between volatile and reputation-based pricing
        volatile_pct = self.config.volatile_price_percentage / 100.0
        reputation_pct = self.config.reputation_price_percentage / 100.0
        
        volatile_portion = base_price * Decimal(str(volatile_pct))
        reputation_portion = (reputation_price - base_price) * Decimal(str(reputation_pct))
        
        total_price = base_price + reputation_portion
        
        return {
            "total_price_eth": str(total_price),
            "volatile_portion_eth": str(volatile_portion),
            "reputation_portion_eth": str(reputation_portion),
            "breakdown_percentages": {
                "volatile": self.config.volatile_price_percentage,
                "reputation": self.config.reputation_price_percentage,
            },
            "base_price_eth": str(base_price),
            "reputation_multiplier": str(rep_multiplier),
        }
    
    def calculate_tax_distribution(
        self,
        price_eth: Decimal
    ) -> Dict[str, Any]:
        """
        Calculate tax distribution for a given price.
        
        Returns:
            Dict with tax amounts for each recipient in ETH and basis points
        """
        # Convert basis points to decimals
        sitewallet_bps = self.config.tax_sitewallet_bps / 10000.0
        profile_owner_bps = self.config.tax_profile_owner_bps / 10000.0
        dao_bps = self.config.tax_dao_bps / 10000.0
        ancient_bps = self.config.tax_ancient_bps / 10000.0
        
        # Calculate amounts
        to_sitewallet = price_eth * Decimal(str(sitewallet_bps))
        to_profile_owner = price_eth * Decimal(str(profile_owner_bps))
        to_dao = price_eth * Decimal(str(dao_bps))
        to_ancient = price_eth * Decimal(str(ancient_bps))
        
        # Remainder to account for rounding
        remainder = price_eth - (to_sitewallet + to_profile_owner + to_dao + to_ancient)
        to_sitewallet += remainder  # Add remainder to sitewallet
        
        return {
            "sitewallet_eth": str(to_sitewallet),
            "profile_owner_eth": str(to_profile_owner),
            "dao_eth": str(to_dao),
            "ancient_eth": str(to_ancient),
            "tax_rates_bps": {
                "sitewallet": self.config.tax_sitewallet_bps,
                "profile_owner": self.config.tax_profile_owner_bps,
                "dao": self.config.tax_dao_bps,
                "ancient": self.config.tax_ancient_bps,
            },
            "total_tax_eth": str(price_eth),
        }
    
    def calculate_sell_price(
        self,
        purchase_price: Decimal,
        current_supply: int
    ) -> Dict[str, Any]:
        """
        Calculate sell price for a FriendPass.
        Ensures profile wallet has enough value to pay back all holders.
        
        Returns:
            Dict with sell price, fee, and net amount
        """
        if not self.config.sell_enabled:
            return {"sell_enabled": False}
        
        # Calculate current market price
        current_price = self.calculate_base_price(current_supply)
        
        # Sell price is the minimum of purchase price and current price
        # This ensures sellers can always sell
        sell_price = min(purchase_price, current_price)
        
        # Apply minimum sell price
        min_sell = Decimal(str(self.config.min_sell_price_eth))
        if sell_price < min_sell:
            sell_price = min_sell
        
        # Calculate sell fee
        sell_fee_bps = self.config.sell_fee_bps / 10000.0
        sell_fee = sell_price * Decimal(str(sell_fee_bps))
        net_amount = sell_price - sell_fee
        
        return {
            "sell_enabled": True,
            "sell_price_eth": str(sell_price),
            "sell_fee_eth": str(sell_fee),
            "net_amount_eth": str(net_amount),
            "fee_percentage": self.config.sell_fee_bps / 100.0,
        }
    
    def simulate_scenario(
        self,
        supply: int,
        reputation: float = 0.0,
        num_purchases: int = 10
    ) -> Dict[str, Any]:
        """
        Simulate a FriendPass purchase scenario.
        
        Returns:
            Dict with simulation results including price progression and revenue
        """
        results = []
        total_revenue = Decimal("0")
        
        for i in range(num_purchases):
            current_supply = supply + i
            price_breakdown = self.calculate_price_breakdown(current_supply, reputation)
            tax_dist = self.calculate_tax_distribution(Decimal(price_breakdown["total_price_eth"]))
            
            total_revenue += Decimal(price_breakdown["total_price_eth"])
            
            results.append({
                "purchase_number": i + 1,
                "supply": current_supply,
                "price_eth": price_breakdown["total_price_eth"],
                "volatile_portion": price_breakdown["volatile_portion_eth"],
                "reputation_portion": price_breakdown["reputation_portion_eth"],
                "tax_distribution": tax_dist,
            })
        
        return {
            "num_purchases": num_purchases,
            "starting_supply": supply,
            "reputation": reputation,
            "total_revenue_eth": str(total_revenue),
            "purchases": results,
        }


async def get_active_config(
    db: AsyncSession,
    config_name: str = "default"
) -> Optional[FriendPassConfig]:
    """
    Get the active FriendPass configuration.
    """
    result = await db.execute(
        select(FriendPassConfig)
        .where(
            FriendPassConfig.config_name == config_name,
            FriendPassConfig.is_active == True
        )
    )
    return result.scalar_one_or_none()


async def calculate_friendpass_price(
    db: AsyncSession,
    supply: int,
    reputation: float = 0.0,
    config_name: str = "default"
) -> Dict[str, Any]:
    """
    Calculate FriendPass price for a given supply and reputation.
    """
    config = await get_active_config(db, config_name)
    if not config:
        logger.warning(f"No active config found for {config_name}, using defaults")
        # Return default pricing
        return {
            "total_price_eth": "0.001",
            "volatile_portion_eth": "0.0006",
            "reputation_portion_eth": "0.0004",
            "tax_distribution": {
                "sitewallet_eth": "0.0003",
                "profile_owner_eth": "0.0004",
                "dao_eth": "0.0002",
                "ancient_eth": "0.0001",
            },
        }
    
    calculator = FriendPassPricingCalculator(config)
    price_breakdown = calculator.calculate_price_breakdown(supply, reputation)
    tax_dist = calculator.calculate_tax_distribution(Decimal(price_breakdown["total_price_eth"]))
    
    return {
        **price_breakdown,
        "tax_distribution": tax_dist,
    }


async def simulate_friendpass_config(
    db: AsyncSession,
    config_params: Dict[str, Any],
    reputation: float = 0.0,
    supply_sold: int = 0,
    simulation_name: str = "Simulation"
) -> Dict[str, Any]:
    """
    Simulate a FriendPass configuration scenario.
    """
    # Create a temporary config object from params
    config = FriendPassConfig(
        base_price_eth=Decimal(str(config_params.get("base_price_eth", "0.001"))),
        slope_eth=Decimal(str(config_params.get("slope_eth", "0.0001"))),
        reputation_enabled=config_params.get("reputation_enabled", True),
        reputation_multiplier=Decimal(str(config_params.get("reputation_multiplier", "1.0"))),
        reputation_base_threshold=config_params.get("reputation_base_threshold", 100.0),
        tax_sitewallet_bps=config_params.get("tax_sitewallet_bps", 3000),
        tax_profile_owner_bps=config_params.get("tax_profile_owner_bps", 4000),
        tax_dao_bps=config_params.get("tax_dao_bps", 2000),
        tax_ancient_bps=config_params.get("tax_ancient_bps", 1000),
        volatile_price_percentage=config_params.get("volatile_price_percentage", 60),
        reputation_price_percentage=config_params.get("reputation_price_percentage", 40),
    )
    
    calculator = FriendPassPricingCalculator(config)
    
    # Simulate 10 purchases
    simulation = calculator.simulate_scenario(
        supply=supply_sold,
        reputation=reputation,
        num_purchases=10
    )
    
    return {
        "simulation_name": simulation_name,
        "config_params": config_params,
        "runner_reputation": reputation,
        "supply_sold": supply_sold,
        "results": simulation,
    }
