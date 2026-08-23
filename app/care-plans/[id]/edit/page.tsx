import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import CarePlanEditor from "@/app/components/CarePlanEditor"

type PageProps = {
  params: Promise<{ id: string }>
}

type CarePlanWithEntity = {
  id: string
  action: string
  intervals: Record<string, number>
  tolerance_days: number
  overdue_days: number
  source: "generated" | "user"
  entities: { name: string } | { name: string }[] | null
}

export default async function CarePlanEditPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth")

  const { data: rawPlan } = await supabase
    .from("care_plans")
    .select(`
      id, action, intervals, tolerance_days, overdue_days, source,
      entities!care_plans_entity_id_fkey (
        name
      )
    `)
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (!rawPlan) notFound()

  const plan = rawPlan as unknown as CarePlanWithEntity

  // Supabase returns joined rows as arrays or objects depending on cardinality
  const entityName =
    Array.isArray(plan.entities)
      ? (plan.entities[0] as { name: string } | undefined)?.name ?? "Entity"
      : (plan.entities as { name: string } | null)?.name ?? "Entity"

  return (
    <CarePlanEditor
      planId={plan.id}
      entityName={entityName}
      initialAction={plan.action}
      initialIntervals={plan.intervals}
      initialToleranceDays={plan.tolerance_days}
      initialOverdueDays={plan.overdue_days}
      source={plan.source}
      note={null}
    />
  )
}
