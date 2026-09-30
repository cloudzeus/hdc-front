import "server-only";
import { prisma } from "@/lib/prisma";
import type { CustomersPage } from "@/lib/admin/customers-types";

export * from "@/lib/admin/customers-types";

/**
 * The customers screen: the individuals who have an account.
 *
 * A list to look things up in, not a queue — newest first. The HDC shop sells
 * to private customers only, so there is no company approval queue here.
 */

const LIMIT = 100;

export async function getCustomers(): Promise<CustomersPage> {
  const where = { accountType: "individual" as const };

  const [individuals, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true, createdAt: true },
    }),
    prisma.customer.count({ where }),
  ]);

  // Order counts in one grouped query rather than per row.
  const emails = individuals.map((i) => i.email);
  const orderCounts = emails.length
    ? await prisma.order.groupBy({
        by: ["email"],
        where: { email: { in: emails } },
        _count: { _all: true },
      })
    : [];
  const ordersByEmail = new Map(orderCounts.map((o) => [o.email, o._count._all]));

  return {
    individuals: individuals.map((i) => ({
      id: i.id,
      name: `${i.firstName} ${i.lastName}`.trim(),
      email: i.email,
      phone: i.phone,
      status: i.status,
      createdAt: i.createdAt,
      orders: ordersByEmail.get(i.email) ?? 0,
    })),
    total,
  };
}
