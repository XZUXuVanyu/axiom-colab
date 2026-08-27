#include "numerical_calc_tool.hpp"
namespace app::tools 
{
cpp_adapter::ToolDescriptor NumericalCalcTool::descriptor() 
{
    using cpp_adapter::ToolDescriptorBuilder;
    using cpp_adapter::schema::Schema;
    return ToolDescriptorBuilder(
               "add_numbers",
               "Add two numbers.",
               "Use when the caller asks to add two numeric values.")
        .parameters(Schema::object()
                	.property("a", Schema::number(), true)
                	.property("b", Schema::number(), true))
        .output(Schema::object()
                	.property("result", Schema::number(), true)).allow_parallel().build();
}
cpp_adapter::Json NumericalCalcTool::execute(
	const cpp_adapter::Json& arguments, cpp_adapter::ToolCallContext&) 
{
    const double a = arguments.at("a").as_number();
    const double b = arguments.at("b").as_number();
    return cpp_adapter::Json::object({{"result", a + b},});
}

CPP_ADAPTER_REGISTER_PUBLIC_TOOL(NumericalCalcTool)
} // namespace app::tools
