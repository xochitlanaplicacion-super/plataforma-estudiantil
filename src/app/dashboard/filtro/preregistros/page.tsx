import { FilterPreRegistrationForm } from '@/components/filter/FilterPreRegistrationForm';
import { getFilterPreregistrationFormData } from '@/lib/actions/filter-preregistrations';

export default async function FilterPreRegistrationsPage() {
  const data = await getFilterPreregistrationFormData();
  return <FilterPreRegistrationForm initialData={data} />;
}
